import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { computeBalances } from '../lib/balances';

export const ASSET_CATEGORIES = [
  { value: 'cash', label: 'Cash' }, { value: 'investment', label: 'Investment' },
  { value: 'property', label: 'Property' }, { value: 'vehicle', label: 'Vehicle' }, { value: 'other', label: 'Other' },
];
export const LIABILITY_CATEGORIES = [
  { value: 'credit', label: 'Credit card' }, { value: 'loan', label: 'Loan' },
  { value: 'mortgage', label: 'Mortgage' }, { value: 'other', label: 'Other' },
];

/** Net worth = account balances + manual assets − manual liabilities − tracked
 *  debts, with breakdown + trend + goal. Debts from the Debt tracker ARE
 *  liabilities: leaving them out overstated net worth by the whole loan balance
 *  (a Ksh 27,000 loan simply didn't appear), even though the screen shows a
 *  "Liabilities" section that listed only credit accounts. */
export function useNetWorth() {
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
      const [accRes, expRes, incRes, xferRes, assetRes, liabRes, snapRes, goalRes, debtRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('account_id, amount').eq('user_id', user.id),
        supabase.from('incomes').select('account_id, amount').eq('user_id', user.id),
        supabase.from('transfers').select('from_account_id, to_account_id, amount, to_amount').eq('user_id', user.id),
        supabase.from('assets').select('*').eq('user_id', user.id).order('value', { ascending: false }),
        supabase.from('liabilities').select('*').eq('user_id', user.id).order('value', { ascending: false }),
        supabase.from('networth_snapshots').select('net_worth, date').eq('user_id', user.id).order('date', { ascending: true }).limit(6),
        supabase.from('networth_goals').select('target_amount, target_date').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('id, name, current_balance, currency').eq('user_id', user.id),
      ]);

      const { assets: accountAssets, liabilities: accountLiabs, multiCurrency } = computeBalances(accRes.data || [], expRes.data || [], incRes.data || [], xferRes.data || [], { convert, displayCurrency: settings.currency });
      const manualAssets = assetRes.data || [];
      const manualLiabs = liabRes.data || [];
      // assets/liabilities/debts each store their own currency (NOT NULL DEFAULT
      // 'USD'); these totals are in the display currency, so convert per row.
      const toDisplay = (v, cur) => convert(Number(v || 0), cur || settings.currency, settings.currency);
      const manualAssetTotal = manualAssets.reduce((s2, a) => s2 + toDisplay(a.value, a.currency), 0);
      const manualLiabTotal = manualLiabs.reduce((s2, l) => s2 + toDisplay(l.value, l.currency), 0);

      // Tracked debts (loans/cards added in the Debt tracker) are liabilities too.
      const trackedDebts = (debtRes.data || []).map((d) => ({
        id: d.id, name: d.name, category: 'loan', value: toDisplay(d.current_balance, d.currency), tracked: true,
      })).filter((d) => d.value > 0);
      const debtTotal = trackedDebts.reduce((s2, d) => s2 + d.value, 0);

      const totalAssets = accountAssets + manualAssetTotal;
      const totalLiabilities = accountLiabs + manualLiabTotal + debtTotal;
      const netWorth = totalAssets - totalLiabilities;

      const snaps = (snapRes.data || []).map((s) => Number(s.net_worth || 0));
      const trend = snaps.length >= 2 ? snaps : null;

      setData({
        netWorth, totalAssets, totalLiabilities,
        accountAssets, accountLiabs,
        assets: manualAssets.map((a) => ({ id: a.id, name: a.name, category: a.category, value: toDisplay(a.value, a.currency), currency: a.currency, notes: a.notes })),
        liabilities: manualLiabs.map((l) => ({ id: l.id, name: l.name, category: l.category, value: toDisplay(l.value, l.currency), currency: l.currency, notes: l.notes })),
        trackedDebts,
        debtTotal,
        trend,
        multiCurrency,
        goal: goalRes.data ? { target: Number(goalRes.data.target_amount || 0), targetDate: goalRes.data.target_date } : null,
      });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, convert, settings.currency]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
