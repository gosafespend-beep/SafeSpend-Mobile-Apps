// Pure budget math — extracted from useBudget so the envelope logic is unit-testable.

/**
 * Envelope rollover for one category.
 *
 * Accumulates (baseLimit − spent) across trailing months, but ONLY months on or
 * after the month the budget was created (`sinceYm`, 'YYYY-MM') — a budget can't
 * bank credit for months it didn't exist (that bug inflated limits by multiples).
 * The result is clamped to ±capMultiple×baseLimit so even long streaks can't
 * produce an absurd effective limit.
 *
 * @param months     array of 'YYYY-MM' month keys eligible for rollover
 * @param baseLimit  the category's monthly limit
 * @param spentByMonth  { 'YYYY-MM': spentInThatMonth }
 * @param sinceYm    'YYYY-MM' the budget existed from (null = no gate)
 * @param capMultiple  clamp at ±capMultiple × baseLimit (default 3)
 */
export function computeRollover(months, baseLimit, spentByMonth, sinceYm = null, capMultiple = 3) {
  const limit = Number(baseLimit) || 0;
  if (limit <= 0 || !Array.isArray(months) || months.length === 0) return 0;
  const eligible = sinceYm ? months.filter((ym) => ym >= sinceYm) : months;
  const raw = eligible.reduce((s, ym) => s + (limit - (Number(spentByMonth[ym]) || 0)), 0);
  const cap = limit * capMultiple;
  return Math.round(Math.max(-cap, Math.min(cap, raw)) * 100) / 100;
}
