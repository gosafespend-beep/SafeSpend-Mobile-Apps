/**
 * Money-math unit tests — the trust layer. Every case here is either a worked
 * example from the 2026-07 audit (regression-locking a real bug) or a boundary
 * the engine must hold. Pure functions only; no network, no RN.
 */
import { computeBalances } from '../balances';
import { computeAvailableToSpend } from '../available';
import { convert, toUsd } from '../fx';
import { computeRollover } from '../budgetMath';
import { advanceDate } from '../recurring';
import { computeHealthScore } from '../healthScore';
import { parseNaturalLanguage } from '../nlparse';
import { parsePrice, formatLikePrice, csvCell } from '../format';

const acct = (id, over = {}) => ({ id, initial_balance: 0, type: 'bank', is_active: true, currency: 'USD', ...over });

describe('computeBalances — ledger', () => {
  test('debit account: init + income − expense', () => {
    const { list } = computeBalances(
      [acct('a', { initial_balance: 1000 })],
      [{ account_id: 'a', amount: 200 }],
      [{ account_id: 'a', amount: 500 }],
      []
    );
    expect(list[0].balance).toBe(1300);
  });

  test('credit account: purchases INCREASE owed, payments reduce it (audit C-fix)', () => {
    const { list, liabilities } = computeBalances(
      [acct('c', { type: 'credit', initial_balance: 500 })],
      [{ account_id: 'c', amount: 100 }],   // purchase on the card
      [{ account_id: 'c', amount: 200 }],   // payment
      []
    );
    expect(list[0].balance).toBe(400);      // 500 + 100 − 200 owed
    expect(liabilities).toBe(400);
  });

  test('transfer bank → credit card is a payment (reduces owed)', () => {
    const { list } = computeBalances(
      [acct('b', { initial_balance: 1000 }), acct('c', { type: 'credit', initial_balance: 500 })],
      [], [],
      [{ from_account_id: 'b', to_account_id: 'c', amount: 300, to_amount: null }]
    );
    expect(list.find((a) => a.id === 'b').balance).toBe(700);
    expect(list.find((a) => a.id === 'c').balance).toBe(200);
  });

  test('overpaid credit card counts as an asset, not a zero liability (audit M5)', () => {
    const { assets, liabilities, netWorth } = computeBalances(
      [acct('c', { type: 'credit', initial_balance: 100 })],
      [], [{ account_id: 'c', amount: 300 }], [] // paid 300 against 100 owed
    );
    expect(liabilities).toBe(0);
    expect(assets).toBe(200);
    expect(netWorth).toBe(200);
  });

  test('orphan transactions (no account) do not move any balance', () => {
    const { list } = computeBalances([acct('a', { initial_balance: 50 })], [{ account_id: null, amount: 40 }], [], []);
    expect(list[0].balance).toBe(50);
  });

  test('cross-currency transfer credits to_amount on the destination', () => {
    const { list } = computeBalances(
      [acct('u', { initial_balance: 100 }), acct('k', { currency: 'KES', initial_balance: 0 })],
      [], [],
      [{ from_account_id: 'u', to_account_id: 'k', amount: 10, to_amount: 1290 }]
    );
    expect(list.find((a) => a.id === 'u').balance).toBe(90);
    expect(list.find((a) => a.id === 'k').balance).toBe(1290);
  });

  test('multiCurrency ignores inactive accounts (audit L1)', () => {
    const { multiCurrency } = computeBalances(
      [acct('a'), acct('k', { currency: 'KES', is_active: false })], [], [], []
    );
    expect(multiCurrency).toBe(false);
  });

  // A lone foreign-currency account still produces an FX-CONVERTED total, so it
  // must be flagged approximate. Previously the flag only tripped on 2+ distinct
  // account currencies, so a single KES account displayed in USD showed a
  // converted figure with no ≈ marker.
  test('multiCurrency flags a single account whose currency is not the display currency', () => {
    const one = computeBalances([acct('k', { currency: 'KES', initial_balance: 12900 })], [], [], [],
      { convert: (a) => a, displayCurrency: 'USD' });
    expect(one.multiCurrency).toBe(true);

    const same = computeBalances([acct('u', { currency: 'USD' })], [], [], [],
      { convert: (a) => a, displayCurrency: 'USD' });
    expect(same.multiCurrency).toBe(false);

    // No accounts at all is not "multi-currency".
    expect(computeBalances([], [], [], [], { displayCurrency: 'USD' }).multiCurrency).toBe(false);
  });

  test('liquid excludes savings/investment; aggregates convert currencies', () => {
    const rates = { USD: 1, KES: 129 };
    const cv = (a, f, t) => convert(a, f, t, rates);
    const { assets, liquidAssets } = computeBalances(
      [acct('k', { currency: 'KES', initial_balance: 12900 }), acct('s', { type: 'savings', initial_balance: 50 })],
      [], [], [], { convert: cv, displayCurrency: 'USD' }
    );
    expect(assets).toBeCloseTo(150, 5);       // 12900 KES → $100, + $50 savings
    expect(liquidAssets).toBeCloseTo(100, 5); // savings excluded from spendable
  });

  // Regression lock for the onboarding audit's F1: starter accounts used to be
  // written as type 'bank' regardless of what the user picked, so a savings
  // balance inflated Safe-to-Spend and a card's debt was counted as spendable
  // money. The account TYPE is what makes these three cases differ — if a write
  // path ever hardcodes the type again, these expectations catch it.
  test('account type drives liquidity: savings and credit are never spendable', () => {
    const mixed = [
      acct('checking', { type: 'bank', initial_balance: 1000 }),
      acct('pot', { type: 'savings', initial_balance: 5000 }),
      acct('visa', { type: 'credit', initial_balance: 800 }), // 800 OWED
    ];
    const { assets, liabilities, liquidAssets, netWorth } = computeBalances(mixed, [], [], []);
    expect(liquidAssets).toBeCloseTo(1000, 5);  // only the checking account
    expect(assets).toBeCloseTo(6000, 5);        // checking + savings, card is not an asset
    expect(liabilities).toBeCloseTo(800, 5);    // the card is debt
    expect(netWorth).toBeCloseTo(5200, 5);

    // The bug: same balances, every account mistyped as 'bank'.
    const mistyped = mixed.map((a) => ({ ...a, type: 'bank' }));
    const wrong = computeBalances(mistyped, [], [], []);
    expect(wrong.liquidAssets).toBeCloseTo(6800, 5); // 6.8× overstated
    expect(wrong.liabilities).toBeCloseTo(0, 5);     // debt vanishes
  });
});

describe('computeAvailableToSpend — Safe to Spend', () => {
  const iso = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const now = new Date(2026, 6, 15); // Jul 15 2026 (31-day month)

  test('income due TODAY is not double-counted as expected (audit S2S guard)', () => {
    const res = computeAvailableToSpend({
      liquidBalance: 1000,
      recurring: [{ type: 'income', amount: 500, next_due: iso(now), is_active: true }],
      now,
    });
    expect(res.expectedIncomeThisMonth).toBe(0);
  });

  test('income due tomorrow IS expected', () => {
    const res = computeAvailableToSpend({
      liquidBalance: 1000,
      recurring: [{ type: 'income', amount: 500, next_due: iso(new Date(2026, 6, 16)), is_active: true }],
      now,
    });
    expect(res.expectedIncomeThisMonth).toBe(500);
    expect(res.availableToSpend).toBe(1500);
  });

  test('unpaid bills subtract; paid ones do not; daily pace uses remaining days', () => {
    const res = computeAvailableToSpend({
      liquidBalance: 1000,
      bills: [{ id: 'b1', amount: 200, due_day: 20, is_active: true }, { id: 'b2', amount: 300, due_day: 25, is_active: true }],
      billStatuses: [{ bill_id: 'b2', is_paid: true }],
      now,
    });
    expect(res.unpaidBillsThisMonth).toBe(200);
    expect(res.availableToSpend).toBe(800);
    expect(res.daysRemaining).toBe(17);                 // Jul 15 → 31, inclusive
    expect(res.dailySafe).toBeCloseTo(800 / 17, 2);
  });

  test('negative availability flags danger status', () => {
    const res = computeAvailableToSpend({
      liquidBalance: 100,
      bills: [{ id: 'b', amount: 500, due_day: 28, is_active: true }],
      now,
    });
    expect(res.availableToSpend).toBe(-400);
    expect(res.status).toBe('danger');
  });
});

describe('fx.convert', () => {
  const rates = { USD: 1, KES: 129, EUR: 0.9 };
  test('USD-base conversion both directions', () => {
    expect(convert(129, 'KES', 'USD', rates)).toBeCloseTo(1, 6);
    expect(convert(1, 'USD', 'KES', rates)).toBeCloseTo(129, 6);
    expect(convert(90, 'EUR', 'KES', rates)).toBeCloseTo(12900, 4);
  });
  test('same currency / missing rate falls back to identity (audit H3 behavior)', () => {
    expect(convert(42, 'USD', 'USD', rates)).toBe(42);
    expect(convert(42, 'XXX', 'USD', rates)).toBe(42); // documented fallback — UI must warn
  });

  test('toUsd stamps correctly and NEVER stamps a guess', () => {
    const helpers = { convert: (a, f, t) => convert(a, f, t, rates), hasRate: (code) => !code || !!rates[code] };
    expect(toUsd(129, 'KES', helpers)).toBeCloseTo(1, 6);   // known rate → stamped
    expect(toUsd(42, 'USD', helpers)).toBe(42);              // USD passthrough
    expect(toUsd(42, 'XXX', helpers)).toBeNull();            // unknown rate → null, not 1:1
    expect(toUsd(42, 'KES', {})).toBeNull();                 // no helpers (offline) → null
  });
});

describe('computeRollover — envelope math (audit C1 regression lock)', () => {
  const months = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  test('a budget created THIS month banks nothing from earlier months', () => {
    expect(computeRollover(months, 10000, {}, '2026-07')).toBe(0);
  });
  test('accumulates only months since creation', () => {
    expect(computeRollover(months, 10000, { '2026-05': 4000, '2026-06': 12000 }, '2026-05'))
      .toBe(4000); // (10000−4000) + (10000−12000)
  });
  test('clamps at ±3× the base limit', () => {
    expect(computeRollover(months, 10000, {}, '2026-01')).toBe(30000);   // 5 empty months would be 50k
    const heavy = { '2026-02': 60000, '2026-03': 60000, '2026-04': 60000, '2026-05': 60000, '2026-06': 60000 };
    expect(computeRollover(months, 10000, heavy, '2026-01')).toBe(-30000);
  });
  test('zero/absent limit yields zero', () => {
    expect(computeRollover(months, 0, {}, null)).toBe(0);
  });
});

describe('advanceDate — recurring schedule (audit M8 drift lock)', () => {
  test('Jan 31 + monthly clamps to Feb 28 (not Mar 2/3)', () => {
    expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  test('leap year clamps to Feb 29', () => {
    expect(advanceDate('2028-01-31', 'monthly')).toBe('2028-02-29');
  });
  test('mid-month dates advance without drift', () => {
    expect(advanceDate('2026-01-15', 'monthly')).toBe('2026-02-15');
  });
  test('weekly and yearly steps', () => {
    expect(advanceDate('2026-01-01', 'weekly')).toBe('2026-01-08');
    expect(advanceDate('2028-02-29', 'yearly')).toBe('2029-02-28');
  });
});

describe('computeHealthScore', () => {
  test('score is always 0..100 with a grade', () => {
    const empty = computeHealthScore({});
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'E']).toContain(empty.grade);
  });
  test('strong finances score Healthy or better', () => {
    const s = computeHealthScore({ liquidAssets: 60000, avgMonthlyExpense: 10000, savingsRate: 25, budgetAdherence: 1, debtToIncome: 0, spendTrendPct: 0 });
    expect(s.score).toBeGreaterThanOrEqual(70);
  });
  test('runway factor dominates when broke', () => {
    const s = computeHealthScore({ liquidAssets: 0, avgMonthlyExpense: 10000, savingsRate: -10, budgetAdherence: 0, debtToIncome: 1.5, spendTrendPct: 40 });
    expect(s.score).toBeLessThan(40);
  });

  // Regression lock: a factor we cannot measure must be EXCLUDED, never invented.
  // Previously no spending history awarded a full 6-month runway (100/100) and no
  // income history reported a confident "0% saved" — the score looked authoritative
  // while being built from empty months.
  test('no spending history leaves runway unknown instead of perfect', () => {
    const s = computeHealthScore({ liquidAssets: 50000, avgMonthlyExpense: 0, monthsOfHistory: 1 });
    const runway = s.factors.find((f) => f.key === 'runway');
    expect(runway.score).toBeNull();
    expect(runway.detail).toMatch(/not enough/i);
  });

  test('no income history leaves savings rate unknown instead of 0%', () => {
    const s = computeHealthScore({ hasIncomeHistory: false });
    const savings = s.factors.find((f) => f.key === 'savings');
    expect(savings.score).toBeNull();
    expect(savings.detail).not.toMatch(/0% of income saved/);
  });

  test('a single month of history leaves the month-over-month trend unknown', () => {
    const s = computeHealthScore({ monthsOfHistory: 1, spendTrendPct: 0 });
    expect(s.factors.find((f) => f.key === 'trend').score).toBeNull();
  });

  test('excluded factors are re-normalised, not scored as zero', () => {
    // Everything measurable is perfect; only runway is unknown. Re-normalising the
    // remaining weights must still yield 100 — treating the unknown as 0 would
    // have dragged this to ~70 and punished the user for having no history.
    const s = computeHealthScore({
      avgMonthlyExpense: 0, savingsRate: 25, budgetAdherence: 1, debtToIncome: 0, spendTrendPct: 0,
    });
    expect(s.factors.find((f) => f.key === 'runway').score).toBeNull();
    expect(s.score).toBe(100);
  });

  test('no budgets set leaves adherence unknown instead of a neutral 60', () => {
    // The caller reports null when the user has no budgets. Turning that into 60
    // handed 15% of the score to a factor with no data behind it, while the row
    // beside it read "No budgets set yet".
    const s = computeHealthScore({ budgetAdherence: null });
    const budget = s.factors.find((f) => f.key === 'budget');
    expect(budget.score).toBeNull();
    expect(budget.detail).toMatch(/no budgets set/i);
  });

  test('debt with no income to compare against is unknown, not the worst score', () => {
    const s = computeHealthScore({ debtToIncome: null });
    expect(s.factors.find((f) => f.key === 'debt').score).toBeNull();
  });

  test('no debt at all is still full marks — that is measured, not missing', () => {
    const s = computeHealthScore({ debtToIncome: 0 });
    expect(s.factors.find((f) => f.key === 'debt').score).toBe(100);
  });

  test('with nothing measurable the score is null, not a number', () => {
    const s = computeHealthScore({
      avgMonthlyExpense: 0, hasIncomeHistory: false, monthsOfHistory: 0,
      budgetAdherence: null, debtToIncome: null,
    });
    expect(s.factors.every((f) => f.score == null)).toBe(true);
    expect(s.score).toBeNull();
    expect(s.insufficient).toBe(true);
    expect(s.grade).toBeNull();
  });
});

describe('parsePrice — paywall regional-price math', () => {
  test('parses common store price formats', () => {
    expect(parsePrice('$89.99').value).toBe(89.99);
    expect(parsePrice('KSh 1,200.50').value).toBe(1200.5);
    expect(parsePrice('€9,99').value).toBe(9.99);          // comma decimal
    expect(parsePrice('TZS 25,000').value).toBe(25000);    // comma thousands, no decimals
  });
  test('unparseable → null (paywall hides savings claims instead of lying)', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('Free')).toBeNull();
  });
  test('formatLikePrice mirrors the source style', () => {
    expect(formatLikePrice(89.99 / 12, parsePrice('$89.99'))).toBe('$7.50');
    expect(formatLikePrice(100, parsePrice('KSh 1,200.50'))).toBe('KSh 100.00');
  });
  test('real savings math: $89.99/yr vs $9.99/mo ≈ 25%', () => {
    const a = parsePrice('$89.99'); const m = parsePrice('$9.99');
    expect(Math.round((1 - a.value / (m.value * 12)) * 100)).toBe(25);
  });
});

describe('csvCell — export hardening (spreadsheet formula injection)', () => {
  test('plain values are quoted, not altered', () => {
    expect(csvCell('Coffee')).toBe('"Coffee"');
    expect(csvCell(4.5)).toBe('"4.5"');
    expect(csvCell(null)).toBe('""');
  });
  test('embedded quotes are doubled per RFC 4180', () => {
    expect(csvCell('a "b" c')).toBe('"a ""b"" c"');
  });
  test('formula-leading cells get a defusing apostrophe', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1+1')).toBe(`"'+1+1"`);
    expect(csvCell('-2+3')).toBe(`"'-2+3"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
  });
  test('a negative number that is not a formula string still round-trips as text', () => {
    // Amounts flow through as strings in the exporter; a leading "-" is defused
    // (harmless — spreadsheets still parse "'-50" visually as -50 for the reader).
    expect(csvCell('-50')).toBe(`"'-50"`);
  });
});

describe('parseNaturalLanguage — quick add', () => {
  test('"coffee 4.50" → expense with note', () => {
    const r = parseNaturalLanguage('coffee 4.50');
    expect(r.amount).toBe(4.5);
    expect(r.type).toBe('expense');
    expect(r.note.toLowerCase()).toContain('coffee');
  });
  test('salary is income; garbage is null', () => {
    expect(parseNaturalLanguage('salary 5000').type).toBe('income');
    expect(parseNaturalLanguage('no numbers here')).toBeNull();
  });
});
