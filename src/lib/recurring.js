import { supabase } from './supabase';
import { toLocalISODate } from './date';
import { fetchRates, convert, toUsd } from './fx';

const todayISO = () => toLocalISODate();

/** Advance an ISO date by one frequency step. Month/year steps clamp to the
 *  target month's length instead of overflowing (Jan 31 + 1mo = Feb 28/29, NOT
 *  Mar 2/3 — JS setMonth overflow would permanently drift the anchor day). */
export function advanceDate(dateStr, freq) {
  const d = new Date(dateStr + 'T00:00:00');
  const clampedMonthAdd = (months) => {
    const y = d.getFullYear();
    const m = d.getMonth() + months;
    const day = d.getDate();
    const daysInTarget = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, daysInTarget));
  };
  switch (freq) {
    case 'daily': d.setDate(d.getDate() + 1); return toLocalISODate(d);
    case 'weekly': d.setDate(d.getDate() + 7); return toLocalISODate(d);
    case 'biweekly': d.setDate(d.getDate() + 14); return toLocalISODate(d);
    case 'yearly': return toLocalISODate(clampedMonthAdd(12));
    case 'monthly':
    default: return toLocalISODate(clampedMonthAdd(1));
  }
}

/**
 * Creates any recurring transactions that have come due, advancing each row's
 * next_due until it's in the future. Returns the number of transactions created.
 * Safe to call on every app open (idempotent via next_due/last_processed).
 */
export async function processDueRecurring(userId) {
  const today = todayISO();
  const { data: rows } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lte('next_due', today);
  if (!rows || rows.length === 0) return 0;

  // Historical-FX stamp for auto-posted rows: rates + account currencies fetched
  // once. Offline / missing rate → no stamp (readers fall back to live convert).
  const [{ data: accts }, fx] = await Promise.all([
    supabase.from('accounts').select('id, currency').eq('user_id', userId),
    fetchRates().catch(() => null),
  ]);
  const curOf = {};
  (accts || []).forEach((a) => { curOf[a.id] = a.currency; });
  const stamp = (amt, accId) => {
    if (!fx?.rates) return {};
    const helpers = { convert: (a, f, t) => convert(a, f, t, fx.rates), hasRate: (code) => !code || !!fx.rates[code] };
    const v = toUsd(amt, curOf[accId] || 'USD', helpers);
    return v == null ? {} : { amount_usd: v };
  };

  let created = 0;
  for (const r of rows) {
    let next = r.next_due;
    let guard = 0;
    while (next <= today && guard < 400) {
      const amt = Number(r.amount || 0);
      const row = r.type === 'income'
        ? { user_id: userId, amount: amt, source: r.category || r.description || 'Recurring', category: r.category || null, account_id: r.account_id, note: r.description || null, date: next, is_recurring: true, ...stamp(amt, r.account_id) }
        : { user_id: userId, amount: amt, category: r.category || r.description || 'Recurring', account_id: r.account_id, note: r.description || null, date: next, is_recurring: true, ...stamp(amt, r.account_id) };
      const { error } = await supabase.from(r.type === 'income' ? 'incomes' : 'expenses').insert(row);
      if (error) break;
      created += 1;
      next = advanceDate(next, r.frequency);
      guard += 1;
    }
    await supabase.from('recurring_transactions').update({ next_due: next, last_processed: today }).eq('id', r.id);
  }
  return created;
}
