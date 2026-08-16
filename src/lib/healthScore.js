// A single 0–100 financial-health score, computed from the data the app already
// has — no new inputs. Five weighted factors, each scored 0–100, each with a
// plain-language line so the number is explainable (never a black box).
//
// Inputs (all in the display currency):
//   liquidAssets      – spendable cash now
//   avgMonthlyExpense – trailing average monthly spend
//   savingsRate       – this-period (net / income), as a %
//   budgetAdherence   – 0..1 share of budgeted categories within their limit (null = no budgets)
//   debtTotal, debtToIncome – total debt, and debt / annualised income (null = no income to compare)
//   spendTrendPct     – month-over-month expense change, % (+ = spending more)

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function computeHealthScore({
  liquidAssets = 0,
  avgMonthlyExpense = 0,
  savingsRate = 0,
  budgetAdherence = null,
  debtToIncome = 0,
  spendTrendPct = 0,
  // How much real history fed the averages above. Without these, a brand-new
  // user's empty months were scored as if they were achievements: no spending
  // history awarded a FULL 6-month runway, and no income history reported
  // "0% saved". A factor we can't actually measure is now excluded from the
  // score rather than invented, and says so.
  hasIncomeHistory = true,
  monthsOfHistory = 2,
} = {}) {
  // 1. Emergency runway — months of expenses covered by liquid cash. 6+ months = full.
  //    Unknown (not "perfect") when we've never seen a month of spending.
  const runwayKnown = avgMonthlyExpense > 0;
  const runwayMonths = runwayKnown ? liquidAssets / avgMonthlyExpense : null;
  const runwayScore = runwayKnown ? clamp((runwayMonths / 6) * 100) : null;

  // 2. Savings rate — 20%+ is excellent, 0% is a floor, negative is bad.
  const savingsScore = hasIncomeHistory ? clamp(savingsRate / 20 * 100) : null;

  // 3. Budget adherence — share of budgets kept. No budgets set is not a
  //    middling result, it is nothing to measure: inventing a neutral 60 handed
  //    15% of the score to a factor the user has no data for (and contradicted
  //    the "No budgets set yet" line shown right beside it).
  const adherenceScore = budgetAdherence == null ? null : clamp(budgetAdherence * 100);

  // 4. Debt load — debt-to-income. 0 = full marks, ≥1.0x annual income = 0.
  //    Null when there is debt but no income to measure it against; scoring that
  //    as the WORST case is the same invention as scoring an empty history as the
  //    best one. No debt at all stays full marks — that is genuinely measured.
  const debtScore = debtToIncome == null ? null : clamp(100 - debtToIncome * 100);

  // 5. Spending trend — needs two complete months to compare at all.
  const trendKnown = monthsOfHistory >= 2;
  const trendScore = trendKnown ? clamp(100 - Math.max(0, spendTrendPct) * (100 / 30)) : null;

  const round = (n) => (n == null ? null : Math.round(n));
  const factors = [
    { key: 'runway', label: 'Emergency runway', score: round(runwayScore), weight: 0.30, detail: runwayKnown ? runwayLine(runwayMonths) : 'Not enough spending history yet' },
    { key: 'savings', label: 'Savings rate', score: round(savingsScore), weight: 0.25, detail: hasIncomeHistory ? `${Math.round(savingsRate)}% of income saved this period` : 'No income recorded yet' },
    { key: 'budget', label: 'Budget adherence', score: round(adherenceScore), weight: 0.15, detail: budgetAdherence == null ? 'No budgets set yet' : `${Math.round(budgetAdherence * 100)}% of budgets on track` },
    { key: 'debt', label: 'Debt load', score: round(debtScore), weight: 0.20, detail: debtToIncome == null ? 'No income recorded to weigh your debt against' : debtToIncome > 0 ? `Debt is ${debtToIncome.toFixed(1)}× your annual income` : 'No tracked debt' },
    { key: 'trend', label: 'Spending trend', score: round(trendScore), weight: 0.10, detail: trendKnown ? trendLine(spendTrendPct) : 'Not enough history to compare months' },
  ];

  // Weight only what we could actually measure, re-normalising so an excluded
  // factor doesn't silently drag the total toward zero.
  const known = factors.filter((f) => f.score != null);
  const totalWeight = known.reduce((s, f) => s + f.weight, 0);
  const score = totalWeight > 0
    ? Math.round(known.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight)
    : null;

  return {
    score,
    grade: score == null ? null : gradeFor(score),
    label: score == null ? 'Not enough data yet' : labelFor(score),
    factors,
    insufficient: score == null,
  };
}

function runwayLine(m) {
  if (m <= 0) return 'No cash buffer yet';
  if (m < 1) return `About ${Math.round(m * 30)} days of expenses covered`;
  return `About ${m.toFixed(1)} months of expenses covered`;
}
function trendLine(pct) {
  if (pct > 5) return `Spending up ${Math.round(pct)}% vs last month`;
  if (pct < -5) return `Spending down ${Math.round(-pct)}% vs last month`;
  return 'Spending steady vs last month';
}
function gradeFor(s) { return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'E'; }
function labelFor(s) {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Healthy';
  if (s >= 55) return 'Fair';
  if (s >= 40) return 'Needs work';
  return 'At risk';
}
