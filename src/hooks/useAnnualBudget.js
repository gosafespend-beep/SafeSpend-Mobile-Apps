import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { normalizeIcon } from '../lib/icons';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Annual budget grid for a given year: each budgeted category's monthly limit and
 * its actual spend per month (Jan–Dec), plus per-month income/expense totals and
 * year-to-date variance.
 */
export function useAnnualBudget(year) {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;
      const [catRes, budRes, expRes, incRes, acctRes] = await Promise.all([
        supabase.from('categories').select('id, name, icon, color').eq('user_id', user.id),
        supabase.from('budgets').select('category_id, monthly_limit, currency').eq('user_id', user.id),
        supabase.from('expenses').select('amount, category, date, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
        supabase.from('incomes').select('amount, date, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
        supabase.from('accounts').select('id, currency').eq('user_id', user.id),
      ]);

      const categories = catRes.data || [];
      const catById = {};
      const nameById = {};
      categories.forEach((cat) => { catById[cat.id] = cat; nameById[cat.id] = cat.name; });
      const resolveName = (v) => (UUID_RE.test(v || '') && nameById[v] ? nameById[v] : v);

      // Convert each transaction from its account's currency into the display
      // currency, matching every other aggregate view (Dashboard/Reports/Budget).
      const displayCur = settings.currency;
      const acctCur = {};
      (acctRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
      const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);

      const limitByCatId = {};
      const rowCvt = (amount, cur) => convert(Number(amount || 0), cur || displayCur, displayCur);
      (budRes.data || []).forEach((b) => { limitByCatId[b.category_id] = rowCvt(b.monthly_limit, b.currency); });

      // actual[categoryName][monthIdx] = total spent
      const actualByName = {};
      const expByMonth = new Array(12).fill(0);
      (expRes.data || []).forEach((e) => {
        const mIdx = new Date(e.date + 'T00:00:00').getMonth();
        const name = resolveName(e.category) || 'Uncategorized';
        if (!actualByName[name]) actualByName[name] = new Array(12).fill(0);
        const amt = cvt(e.amount, e.account_id);
        actualByName[name][mIdx] += amt;
        expByMonth[mIdx] += amt;
      });

      const incByMonth = new Array(12).fill(0);
      (incRes.data || []).forEach((i) => {
        const mIdx = new Date(i.date + 'T00:00:00').getMonth();
        incByMonth[mIdx] += cvt(i.amount, i.account_id);
      });

      // One row per budgeted category (monthly_limit > 0).
      const rows = (budRes.data || [])
        .filter((b) => rowCvt(b.monthly_limit, b.currency) > 0 && catById[b.category_id])
        .map((b) => {
          const cat = catById[b.category_id];
          const limit = rowCvt(b.monthly_limit, b.currency);
          const months = actualByName[cat.name] || new Array(12).fill(0);
          const yearActual = months.reduce((s, n) => s + n, 0);
          return {
            id: b.category_id,
            name: cat.name,
            icon: normalizeIcon(cat.icon),
            color: cat.color || '168 76% 42%',
            limit,
            yearLimit: limit * 12,
            months,
            yearActual,
          };
        })
        .sort((a, b) => b.yearLimit - a.yearLimit);

      const totalYearBudget = rows.reduce((s, r) => s + r.yearLimit, 0);
      const totalYearActual = rows.reduce((s, r) => s + r.yearActual, 0);
      const totalYearIncome = incByMonth.reduce((s, n) => s + n, 0);
      const totalYearExpenses = expByMonth.reduce((s, n) => s + n, 0);

      setData({
        rows, expByMonth, incByMonth,
        totalYearBudget, totalYearActual, totalYearIncome, totalYearExpenses,
      });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, year, settings.currency, convert]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
