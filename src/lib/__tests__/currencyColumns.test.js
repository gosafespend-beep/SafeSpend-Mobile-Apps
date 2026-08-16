const fs = require('fs');
const path = require('path');

/**
 * Bills, debts, savings_goals, assets, liabilities and budgets each store their
 * OWN currency (`currency text NOT NULL DEFAULT 'USD'`) rather than inheriting an
 * account's. A read site that selects the amount but forgets the currency column
 * silently treats the number as already being in the display currency — so a
 * Ksh 27,000 loan showed up as $27,000, and a KES budget cap became a USD one.
 *
 * That mistake is invisible in a single-currency account and was present in six
 * separate places at once, so it is guarded statically rather than by hoping the
 * next reader remembers.
 */
const ROW_CURRENCY_TABLES = ['bills', 'debts', 'savings_goals', 'assets', 'liabilities', 'budgets'];

// Amount-bearing columns per table. A select that pulls none of these does not
// do money math (e.g. fetching only a name or a due_day), so it needs no currency.
const AMOUNT_COLUMNS = /\b(amount|value|monthly_limit|target_amount|current_amount|current_balance|starting_balance|minimum_payment)\b/;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') sourceFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('per-row currency columns', () => {
  const src = path.join(__dirname, '..', '..');
  const files = sourceFiles(src);

  it('finds the app source to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test.each(ROW_CURRENCY_TABLES)('every %s select that reads an amount also reads currency', (table) => {
    // Matches supabase.from('<table>').select('<columns>') across the codebase.
    // The rest of the line is captured too, so an explicit opt-out comment can
    // be seen: /* currency-safe: <reason> */
    const re = new RegExp(
      `from\\(['"]${table}['"]\\)\\s*\\.select\\(\\s*['"]([^'"]*)['"][^\\n]*`,
      'g'
    );
    const offenders = [];

    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      let m;
      while ((m = re.exec(code)) !== null) {
        const columns = m[1];
        if (columns.trim() === '*') continue; // select('*') already includes currency
        if (!AMOUNT_COLUMNS.test(columns)) continue; // no money read, no conversion needed
        if (/\bcurrency\b/.test(columns)) continue;
        // An explicit opt-out documents WHY a raw amount is safe — e.g. a ratio
        // between two columns of the SAME row, which needs no conversion.
        if (/\/\* *currency-safe:/.test(m[0])) continue;
        offenders.push(`${path.relative(src, file)} → select('${columns}')`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // The mirror-image rule. These tables have NO currency column: a row's currency
  // is its account's. Selecting `amount` without `account_id` therefore makes the
  // amount unconvertible, and it silently gets summed as if already in the display
  // currency — which is how recurring subscription amounts ended up mixed in with
  // converted expenses in the same monthly total.
  const ACCOUNT_DENOMINATED = ['expenses', 'incomes', 'recurring_transactions'];

  test.each(ACCOUNT_DENOMINATED)('every %s select that reads amount also reads account_id', (table) => {
    const re = new RegExp(
      `from\\(['"]${table}['"]\\)\\s*\\.select\\(\\s*['"]([^'"]*)['"][^\\n]*`,
      'g'
    );
    const offenders = [];

    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      let m;
      while ((m = re.exec(code)) !== null) {
        const columns = m[1];
        if (columns.trim() === '*') continue;
        if (!/\bamount\b/.test(columns)) continue;
        if (/\baccount_id\b/.test(columns)) continue;
        if (/\/\* *currency-safe:/.test(m[0])) continue;
        offenders.push(`${path.relative(src, file)} → select('${columns}')`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
