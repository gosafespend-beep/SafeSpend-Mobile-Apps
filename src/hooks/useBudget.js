import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { usePeriod } from '../contexts/PeriodContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { normalizeIcon } from '../lib/icons';
import { toLocalISODate } from '../lib/date';
import { computeRollover } from '../lib/budgetMath';

/**
 * Monthly budget view: income to allocate, per-category limits with current
 * spend, and allocation totals. Spend is currency-converted per account so
 * multi-currency users see correct numbers. With rollover on, each category's
 * unused (or overspent) amount from last month adjusts this month's effective limit.
 */
export function useBudget() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { start, end } = usePeriod();
  const { settings } = useSettings();
  const { convert } = useFx();
  const rollover = !!settings.budgetRollover;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
    // Rollover looks back over the trailing complete months the user was active
    // (bounded), accumulating each category's unused/overspent budget — a proper
    // envelope carry rather than a single-month snapshot.
    const startDate = new Date(start + 'T00:00:00');
    const ROLL_MONTHS = 6;
    const rollWindowStart = toLocalISODate(new Date(startDate.getFullYear(), startDate.getMonth() - ROLL_MONTHS, 1));

    const [catRes, budRes, expRes, incRes, prevExpRes, acctRes] = await Promise.all([
      supabase.from('categories').select('id, name, icon, color').eq('user_id', user.id),
      supabase.from('budgets').select('category_id, monthly_limit, currency, created_at').eq('user_id', user.id),
      supabase.from('expenses').select('amount, category, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
      supabase.from('incomes').select('amount, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
      rollover ? supabase.from('expenses').select('amount, category, account_id, date').eq('user_id', user.id).gte('date', rollWindowStart).lt('date', start) : Promise.resolve({ data: [] }),
      supabase.from('accounts').select('id, currency').eq('user_id', user.id),
    ]);

    const displayCur = settings.currency;
    const acctCur = {};
    (acctRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
    const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);

    const categories = catRes.data || [];
    const catById = {};
    categories.forEach((cat) => { catById[cat.id] = cat; });
    // Resolve a stored category value (a name, or a legacy category id) to its
    // name, so budget spend matches the Dashboard's category totals exactly.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const catName = (v) => (UUID_RE.test(v || '') && catById[v] ? catById[v].name : (v || 'Uncategorized'));

    const spentByName = {};
    (expRes.data || []).forEach((e) => { const k = catName(e.category); spentByName[k] = (spentByName[k] || 0) + cvt(e.amount, e.account_id); });

    // Accumulate rollover only across trailing months that actually had activity,
    // so a brand-new user isn't credited months of "unused" budget they never had.
    const prevByMonthCat = {};
    const activeMonths = new Set();
    (prevExpRes.data || []).forEach((e) => {
      const ym = String(e.date).slice(0, 7);
      activeMonths.add(ym);
      const k = `${ym}|${catName(e.category)}`;
      prevByMonthCat[k] = (prevByMonthCat[k] || 0) + cvt(e.amount, e.account_id);
    });
    const rollMonths = Array.from(activeMonths);

    const cats = (budRes.data || [])
      .map((b) => {
        const cat = catById[b.category_id];
        if (!cat) return null;
        const baseLimit = convert(Number(b.monthly_limit || 0), b.currency || displayCur, displayCur);
        // Rollover only from months the budget actually existed (created_at gate)
        // and clamped — a new budget must not bank credit for pre-budget months.
        const sinceYm = b.created_at ? String(b.created_at).slice(0, 7) : null;
        const spentByMonth = {};
        rollMonths.forEach((ym) => { spentByMonth[ym] = prevByMonthCat[`${ym}|${cat.name}`] || 0; });
        const roll = rollover ? computeRollover(rollMonths, baseLimit, spentByMonth, sinceYm) : 0;
        return {
          id: b.category_id,
          name: cat.name,
          icon: normalizeIcon(cat.icon),
          color: cat.color || '168 76% 42%',
          baseLimit,
          rollover: roll,
          limit: Math.max(0, baseLimit + roll),
          spent: spentByName[cat.name] || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.limit - a.limit);

    const income = (incRes.data || []).reduce((s, i) => s + cvt(i.amount, i.account_id), 0);
    const budgeted = cats.reduce((s, x) => s + x.baseLimit, 0);

    setData({ income, budgeted, remaining: income - budgeted, cats, rolloverOn: rollover });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, start, end, settings.currency, convert, rollover]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}

/**
 * Suggest a monthly limit per category from the trailing 3 full months of spend
 * (average, rounded up to a tidy number), and upsert them as budgets. Returns
 * the number of categories budgeted. Categories with no history are skipped.
 */
export async function autoBudgetFromHistory(userId, convert, displayCurrency = 'USD') {
  const now = new Date();
  const start = toLocalISODate(new Date(now.getFullYear(), now.getMonth() - 3, 1));
  const end = toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)); // exclude current partial month

  const [catRes, expRes, acctRes] = await Promise.all([
    supabase.from('categories').select('id, name').eq('user_id', userId),
    supabase.from('expenses').select('amount, category, account_id').eq('user_id', userId).gte('date', start).lt('date', end),
    supabase.from('accounts').select('id, currency').eq('user_id', userId),
  ]);
  const acctCur = {}; (acctRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
  const cvt = (amt, accId) => convert(Number(amt || 0), acctCur[accId] || displayCurrency, displayCurrency);

  const idByName = {}; (catRes.data || []).forEach((c) => { idByName[c.name] = c.id; });
  const totalByName = {};
  (expRes.data || []).forEach((e) => { const k = e.category || 'Uncategorized'; totalByName[k] = (totalByName[k] || 0) + cvt(e.amount, e.account_id); });

  const niceRound = (n) => { if (n <= 0) return 0; const mag = Math.pow(10, Math.max(0, String(Math.round(n)).length - 2)); return Math.ceil(n / mag) * mag; };
  const rows = [];
  Object.entries(totalByName).forEach(([name, total]) => {
    const id = idByName[name];
    if (!id) return; // only categories that exist as records
    const monthly = niceRound(total / 3);
    // `monthly` was summed through cvt(), so it is already in displayCurrency.
    if (monthly > 0) rows.push({ user_id: userId, category_id: id, monthly_limit: monthly, currency: displayCurrency });
  });
  if (!rows.length) return 0;
  const { error } = await supabase.from('budgets').upsert(rows, { onConflict: 'user_id,category_id' });
  if (error) throw error;
  return rows.length;
}
