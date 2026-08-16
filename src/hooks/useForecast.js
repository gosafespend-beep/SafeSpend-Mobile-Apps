import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { computeBalances } from '../lib/balances';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';

// Monthly-equivalent multiplier for a recurring frequency.
const PER_MONTH = { daily: 30, weekly: 4.345, biweekly: 2.17, monthly: 1, yearly: 1 / 12 };

/** Projects liquid balance for the next 6 months from recurring income/expense + bills. */
export function useForecast() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [accRes, expRes, incRes, xferRes, recRes, billRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('expenses').select('account_id, amount').eq('user_id', user.id),
      supabase.from('incomes').select('account_id, amount').eq('user_id', user.id),
      supabase.from('transfers').select('from_account_id, to_account_id, amount, to_amount').eq('user_id', user.id),
      supabase.from('recurring_transactions').select('type, amount, frequency, account_id').eq('user_id', user.id).eq('is_active', true),
      supabase.from('bills').select('amount, currency').eq('user_id', user.id).eq('is_active', true),
    ]);

    // The projection adds a monthly net to a net-worth starting point, so every
    // term has to be in the display currency: accounts and recurring rows follow
    // their account, bills their own `currency` column.
    const displayCur = settings.currency;
    const acctCur = {};
    (accRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
    const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);

    const { netWorth } = computeBalances(accRes.data || [], expRes.data || [], incRes.data || [], xferRes.data || [], { convert, displayCurrency: displayCur });
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    (recRes.data || []).forEach((r) => {
      const perMonth = cvt(r.amount, r.account_id) * (PER_MONTH[r.frequency] || 1);
      if (r.type === 'income') monthlyIncome += perMonth; else monthlyExpense += perMonth;
    });
    const monthlyBills = (billRes.data || []).reduce((s2, b) => s2 + convert(Number(b.amount || 0), b.currency || displayCur, displayCur), 0);
    const monthlyNet = monthlyIncome - monthlyExpense - monthlyBills;

    const now = new Date();
    const series = [{ label: 'Now', value: netWorth }];
    let bal = netWorth;
    for (let i = 1; i <= 6; i++) {
      bal += monthlyNet;
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      series.push({ label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d), value: bal });
    }
    setData({ series, monthlyIncome, monthlyExpense, monthlyBills, monthlyNet, hasRecurring: (recRes.data || []).length > 0 || monthlyBills > 0 });
    setLoading(false);
  }, [user, settings.currency, convert]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, reload: load };
}
