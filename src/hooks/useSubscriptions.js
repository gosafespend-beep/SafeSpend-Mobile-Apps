import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalISODate } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { merchantKey } from '../lib/merchantRules';

// Normalize with the shared merchant normalizer so "Netflix", "NETFLIX  monthly"
// and "Netflix 0712…" group as one merchant instead of splitting the detection.
const keyOf = (s) => merchantKey(s);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Detects likely subscriptions / recurring charges from the last ~4 months of
 * expenses: same merchant (note/category), similar amount, appearing 2+ times at
 * a roughly monthly cadence. Also folds in explicit recurring expense rules.
 * No bank integration needed — pure client-side heuristic.
 */
export function useSubscriptions() {
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
      const since = new Date();
      since.setMonth(since.getMonth() - 4);
      const sinceISO = toLocalISODate(since);

      const [{ data: expenses }, { data: recurring }, { data: accts }] = await Promise.all([
        supabase.from('expenses').select('amount, category, note, date, account_id').eq('user_id', user.id).gte('date', sinceISO).order('date', { ascending: true }),
        supabase.from('recurring_transactions').select('description, amount, frequency, is_active, type, account_id').eq('user_id', user.id).eq('type', 'expense'),
        supabase.from('accounts').select('id, currency').eq('user_id', user.id),
      ]);

      // Convert each expense from its account's currency into the display
      // currency before grouping, so amount-consistency + totals aren't mixing
      // currencies for users with multi-currency accounts.
      const displayCur = settings.currency;
      const acctCur = {};
      (accts || []).forEach((a) => { acctCur[a.id] = a.currency; });
      const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);

      // Group expenses by merchant key.
      const groups = {};
      (expenses || []).forEach((e) => {
        const k = keyOf(e.note || e.category);
        if (!k) return;
        (groups[k] = groups[k] || []).push({ amount: cvt(e.amount, e.account_id), date: e.date, label: (e.note || e.category) });
      });

      const detected = [];
      Object.entries(groups).forEach(([k, txns]) => {
        if (txns.length < 2) return;
        const amounts = txns.map((t) => t.amount);
        const med = median(amounts);
        if (med <= 0) return;
        // Amounts must be consistent (all within 20% of the median).
        const consistent = amounts.every((a) => Math.abs(a - med) <= med * 0.2);
        if (!consistent) return;
        // Roughly monthly cadence: average gap between 20 and 40 days.
        const days = txns.map((t) => new Date(t.date + 'T00:00:00').getTime()).sort((a, b) => a - b);
        let gapSum = 0;
        for (let i = 1; i < days.length; i++) gapSum += (days[i] - days[i - 1]) / 86400000;
        const avgGap = gapSum / (days.length - 1);
        if (avgGap < 20 || avgGap > 40) return;
        // Price-hike: require the last TWO charges above the first (one odd month
        // — a promo ending, a partial refund — must not flag a false "+%").
        const first = amounts[0];
        const lastTwo = amounts.slice(-2);
        const hiked = first > 0 && lastTwo.length === 2 && lastTwo.every((a) => a > first * 1.1);
        const last = amounts[amounts.length - 1];
        const priceHike = hiked ? { from: first, to: last, pct: Math.round(((last - first) / first) * 100) } : null;
        detected.push({
          key: k,
          name: txns[txns.length - 1].label,
          amount: med,
          count: txns.length,
          lastDate: txns[txns.length - 1].date,
          priceHike,
          source: 'detected',
        });
      });

      // Fold in explicit active recurring expense rules (monthly-normalized).
      (recurring || []).filter((r) => r.is_active !== false).forEach((r) => {
        const k = keyOf(r.description);
        if (detected.some((d) => d.key === k)) return;
        const f = String(r.frequency || 'monthly').toLowerCase();
        // Recurring amounts are denominated in their account, and land in the
        // same monthlyTotal as the converted expenses above.
        let monthly = cvt(r.amount, r.account_id);
        if (f.includes('year')) monthly /= 12;
        else if (f.includes('week')) monthly *= 4.33;
        detected.push({ key: k || `rec-${r.description}`, name: r.description || 'Subscription', amount: monthly, count: null, lastDate: null, source: 'recurring' });
      });

      detected.sort((a, b) => b.amount - a.amount);
      const monthlyTotal = detected.reduce((s, d) => s + d.amount, 0);
      setData({ subscriptions: detected, monthlyTotal, yearlyTotal: monthlyTotal * 12 });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, settings.currency, convert]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
