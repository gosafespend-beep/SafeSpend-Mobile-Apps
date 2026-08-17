import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { computeBalances } from '../lib/balances';
import { usePeriod } from '../contexts/PeriodContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { toLocalISODate } from '../lib/date';

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const iso = toLocalISODate;
  return { start: iso(start), end: iso(end) };
}

/**
 * Real reporting figures: net worth (from accounts), 6-point net-worth trend
 * (from networth_snapshots), a savings-rate-based health score, and the
 * emergency-fund goal coverage. No fabricated numbers.
 */
export function useReports() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { start, end } = usePeriod();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {

    const [accRes, expRes, incRes, allExpRes, allIncRes, xferRes, snapRes, goalRes] = await Promise.all([
      supabase.from('accounts').select('id, initial_balance, type, is_active, currency').eq('user_id', user.id),
      supabase.from('expenses').select('amount, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
      supabase.from('incomes').select('amount, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
      supabase.from('expenses').select('account_id, amount').eq('user_id', user.id),
      supabase.from('incomes').select('account_id, amount').eq('user_id', user.id),
      supabase.from('transfers').select('from_account_id, to_account_id, amount, to_amount').eq('user_id', user.id),
      supabase.from('networth_snapshots').select('net_worth, date').eq('user_id', user.id).order('date', { ascending: true }).limit(6),
      supabase.from('savings_goals').select('name, current_amount, target_amount, currency').eq('user_id', user.id).ilike('name', '%emergency%').maybeSingle(),
    ]);

    // Everything below is expressed in the display currency: transactions are
    // denominated in their account, the emergency goal in its own `currency`.
    const displayCur = settings.currency;
    const acctCur = {};
    (accRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
    const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);

    // Net worth from the shared balance helper (consistent with Accounts + Dashboard).
    const { assets, liabilities: liabs, netWorth } = computeBalances(accRes.data || [], allExpRes.data || [], allIncRes.data || [], xferRes.data || [], { convert, displayCurrency: displayCur });

    const monthExpenses = (expRes.data || []).reduce((s2, e) => s2 + cvt(e.amount, e.account_id), 0);
    const monthIncome = (incRes.data || []).reduce((s2, i) => s2 + cvt(i.amount, i.account_id), 0);
    const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpenses) / monthIncome) * 100 : 0;
    const score = Math.max(0, Math.min(100, Math.round(savingsRate)));
    const scoreLabel = score >= 70 ? 'Healthy' : score >= 40 ? 'On track' : 'Tight';

    const snaps = (snapRes.data || []).map((s) => Number(s.net_worth || 0));
    const trend = snaps.length >= 2 ? snaps : null;
    const monthChange = snaps.length >= 2 ? snaps[snaps.length - 1] - snaps[snaps.length - 2] : null;

    let emergency = null;
    if (goalRes.data) {
      // monthsCovered divides the goal by monthly expenses, so the goal has to be
      // converted too — otherwise it mixes two currencies in one ratio.
      const gc = goalRes.data.currency || displayCur;
      const current = convert(Number(goalRes.data.current_amount || 0), gc, displayCur);
      const target = convert(Number(goalRes.data.target_amount || 0), gc, displayCur);
      emergency = {
        current,
        target,
        pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
        monthsCovered: monthExpenses > 0 ? current / monthExpenses : null,
      };
    }

    setData({ netWorth, monthIncome, monthExpenses, savingsRate, score, scoreLabel, trend, monthChange, emergency });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, start, end, settings.currency, convert]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
