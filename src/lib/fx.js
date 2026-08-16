import { supabase } from './supabase';

/**
 * Currency conversion against the shared `fx_rates` table (USD base — `rate` is
 * units of that currency per 1 USD, so USD = 1, KES ≈ 129).
 *
 *   convert(amount, from, to, rates)  →  amount / rates[from] * rates[to]
 *
 * Missing rate ⇒ 1:1 fallback (callers surface an "approximate" marker), so a
 * gap in the table can never crash a total.
 */
export function convert(amount, from, to, rates) {
  const n = Number(amount) || 0;
  if (!from || !to || from === to || !rates) return n;
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) return n;
  return (n / rf) * rt;
}

/**
 * USD value of an amount at ENTRY time — written to the `amount_usd` column so
 * historical reports stop drifting with today's rate (H2 phase 1: write path).
 * Returns null when the rate is unknown (never stamp a guess); readers fall
 * back to live conversion for null/legacy rows.
 */
export function toUsd(amount, currency, { convert: convertFn, hasRate } = {}) {
  const n = Number(amount) || 0;
  if (!currency || currency === 'USD') return Math.round(n * 100) / 100;
  if (!convertFn || !hasRate || !hasRate(currency) || !hasRate('USD')) return null;
  return Math.round(convertFn(n, currency, 'USD') * 100) / 100;
}

/** Fetch the whole rate table (≈18 tiny rows). Returns { rates, fetchedAt } or null. */
export async function fetchRates() {
  const { data, error } = await supabase.from('fx_rates').select('code, rate, fetched_at');
  if (error || !data || !data.length) return null;
  const rates = {};
  let fetchedAt = null;
  data.forEach((r) => {
    rates[r.code] = Number(r.rate);
    if (!fetchedAt || r.fetched_at > fetchedAt) fetchedAt = r.fetched_at;
  });
  return { rates, fetchedAt };
}
