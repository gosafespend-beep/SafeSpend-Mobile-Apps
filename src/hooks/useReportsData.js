import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { usePeriod } from '../contexts/PeriodContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { hsl } from '../theme/tokens';
import { toLocalISODate } from '../lib/date';

const CHART_COLORS = ['168 76% 42%', '38 92% 50%', '45 93% 47%', '262 52% 56%', '200 70% 50%', '350 70% 55%', '158 64% 45%'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Multi-month series + period category breakdown + needs/wants split for Reports. */
export function useReportsData() {
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
      // Rolling last 6 months for the trend charts.
      const now = new Date();
      const trendStart = toLocalISODate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
      const [exTrend, inTrend, exPeriod, catsRes, acctRes] = await Promise.all([
        supabase.from('expenses').select('amount, date, category, account_id').eq('user_id', user.id).gte('date', trendStart),
        supabase.from('incomes').select('amount, date, account_id').eq('user_id', user.id).gte('date', trendStart),
        supabase.from('expenses').select('amount, category, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
        supabase.from('categories').select('id, name, color, is_need').eq('user_id', user.id),
        supabase.from('accounts').select('id, currency').eq('user_id', user.id),
      ]);

      // Every figure this hook returns is a SUM across accounts — monthly trend,
      // category breakdown, needs/wants — so each transaction converts from its
      // account's currency into the display currency first. These also feed the
      // Reports health score's avgMonthlyExpense / savingsRate inputs.
      const displayCur = settings.currency;
      const acctCur = {};
      (acctRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
      const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);

      const cats = catsRes.data || [];
      const byId = {}; const colorByName = {}; const needByName = {};
      cats.forEach((cat) => { byId[cat.id] = cat; colorByName[cat.name] = cat.color; needByName[cat.name] = !!cat.is_need; });
      const resolveName = (v) => (UUID_RE.test(v || '') && byId[v] ? byId[v].name : v);

      // Build 6-month buckets.
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: monthKey(d), label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d), income: 0, expense: 0 });
      }
      const idx = {}; months.forEach((m, i) => { idx[m.key] = i; });
      (exTrend.data || []).forEach((e) => { const k = String(e.date).slice(0, 7); if (idx[k] != null) months[idx[k]].expense += cvt(e.amount, e.account_id); });
      (inTrend.data || []).forEach((i2) => { const k = String(i2.date).slice(0, 7); if (idx[k] != null) months[idx[k]].income += cvt(i2.amount, i2.account_id); });
      const monthly = months.map((m) => ({ ...m, net: m.income - m.expense }));

      // Period category breakdown + needs/wants.
      const byCat = {};
      let needs = 0; let wants = 0;
      (exPeriod.data || []).forEach((e) => {
        const name = resolveName(e.category) || 'Uncategorized';
        const amt = cvt(e.amount, e.account_id);
        byCat[name] = (byCat[name] || 0) + amt;
        if (needByName[name]) needs += amt; else wants += amt;
      });
      const categories = Object.entries(byCat)
        .map(([name, value], i) => ({ name, value, color: hsl(colorByName[name] || CHART_COLORS[i % CHART_COLORS.length]) }))
        .sort((a, b) => b.value - a.value);

      setData({ monthly, categories, needs, wants });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, start, end, settings.currency, convert]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
