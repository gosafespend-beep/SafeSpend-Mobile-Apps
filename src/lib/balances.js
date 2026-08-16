/**
 * Single source of truth for account balances. Every screen (Dashboard, Accounts,
 * Reports) must use this so the same user never sees three different totals.
 *
 * Running balance = initial_balance + incomes − expenses + transfers, matched by
 * account_id. Each account's balance is in that account's own currency (an
 * amount's currency is its account's currency). Credit accounts are liabilities.
 *
 * Cross-account aggregates (assets / liabilities / net worth) convert every
 * account into `displayCurrency` via the supplied `convert(amount, from, to)`.
 * With one currency (or no converter) this is a no-op, so single-currency users
 * are unaffected.
 *
 * opts: { convert?, displayCurrency? }
 */
export function computeBalances(accounts = [], expenses = [], incomes = [], transfers = [], opts = {}) {
  const { convert = (a) => a, displayCurrency = 'USD' } = opts;

  const expByAcc = {};
  expenses.forEach((e) => {
    if (e.account_id) expByAcc[e.account_id] = (expByAcc[e.account_id] || 0) + Number(e.amount || 0);
  });
  const incByAcc = {};
  incomes.forEach((i) => {
    if (i.account_id) incByAcc[i.account_id] = (incByAcc[i.account_id] || 0) + Number(i.amount || 0);
  });
  // Transfers move money between accounts. The destination receives `to_amount`
  // when set (a cross-currency transfer in the destination's currency),
  // otherwise the same `amount` (same-currency transfer).
  const xferByAcc = {};
  transfers.forEach((t) => {
    const outAmt = Number(t.amount || 0);
    const inAmt = t.to_amount != null ? Number(t.to_amount) : outAmt;
    if (t.from_account_id) xferByAcc[t.from_account_id] = (xferByAcc[t.from_account_id] || 0) - outAmt;
    if (t.to_account_id) xferByAcc[t.to_account_id] = (xferByAcc[t.to_account_id] || 0) + inAmt;
  });

  const list = accounts.map((a) => {
    const credit = String(a.type || '').toLowerCase() === 'credit';
    const init = Number(a.initial_balance || 0);
    const inc = incByAcc[a.id] || 0;
    const exp = expByAcc[a.id] || 0;
    const xfer = xferByAcc[a.id] || 0;
    // A credit account tracks the amount OWED (a positive number): purchases
    // (expenses) increase it; payments — income or an incoming transfer — reduce
    // it. Every other account tracks its spendable balance.
    const balance = credit ? init + exp - inc - xfer : init + inc - exp + xfer;
    const currency = a.currency || displayCurrency;
    return { ...a, currency, balance, credit, isActive: a.is_active !== false };
  });

  // Convert each account into the display currency before summing.
  const toDisplay = (a) => convert(a.balance, a.currency, displayCurrency);
  // An overpaid credit card (negative owed) is money in the user's favor — an
  // asset, not a liability of zero.
  const assets = list.filter((a) => a.isActive).reduce((s, a) => {
    if (!a.credit) return s + toDisplay(a);
    return s + Math.max(0, -toDisplay(a));
  }, 0);
  // Credit balances are amounts owed; only a positive owed balance is a liability.
  const liabilities = list.filter((a) => a.credit).reduce((s, a) => s + Math.max(0, toDisplay(a)), 0);

  // "Liquid" = spendable now. Excludes money the user has parked in savings /
  // investments (still an asset for net worth, but not "safe to spend today").
  const NON_LIQUID = new Set(['savings', 'investment', 'retirement']);
  const liquidAssets = list
    .filter((a) => !a.credit && a.isActive && !NON_LIQUID.has(String(a.type || '').toLowerCase()))
    .reduce((s, a) => s + toDisplay(a), 0);

  // True when any aggregate here had to be converted — i.e. more than one
  // currency is in play among active accounts, OR the single account currency
  // isn't the display currency. The display currency has to be part of the test:
  // a lone KES account shown in USD is still an FX-converted (approximate)
  // total and must carry the same ≈ marker as a genuinely mixed portfolio.
  // (Inactive accounts are ignored — a closed foreign account shouldn't mark
  // every total approximate.)
  const activeCurrencies = list.filter((a) => a.isActive).map((a) => a.currency);
  const multiCurrency = new Set([...activeCurrencies, displayCurrency]).size > 1;

  return { list, assets, liquidAssets, liabilities, netWorth: assets - liabilities, multiCurrency };
}
