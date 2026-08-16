import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { computeBalances } from '../lib/balances';
import { cacheGet, cacheSet } from '../lib/cache';

const ICON_BY_TYPE = {
  cash: 'wallet', bank: 'wallet', checking: 'wallet', savings: 'piggy',
  credit: 'creditCard', investment: 'trendingUp', emergency: 'shield',
};

export function accountIcon(type) {
  const key = String(type || '').toLowerCase();
  return ICON_BY_TYPE[key] || 'wallet';
}

/**
 * Accounts with a running balance in each account's own currency, plus net
 * assets / liabilities / worth converted into the user's display currency.
 * Balances recompute (without refetching) when FX rates or display currency
 * change, so multi-currency totals stay live.
 */
export function useAccounts() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [raw, setRaw] = useState(null); // { accounts, expenses, incomes, transfers }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const [accRes, expRes, incRes, xferRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('expenses').select('account_id, amount').eq('user_id', user.id),
        supabase.from('incomes').select('account_id, amount').eq('user_id', user.id),
        supabase.from('transfers').select('from_account_id, to_account_id, amount, to_amount').eq('user_id', user.id),
      ]);
      const next = { accounts: accRes.data || [], expenses: expRes.data || [], incomes: incRes.data || [], transfers: xferRes.data || [] };
      setRaw(next);
      cacheSet(user.id, 'accounts-raw', next);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user]);

  // Stale-while-revalidate: hydrate raw data, refresh over it.
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    cacheGet(user.id, 'accounts-raw').then((cached) => {
      if (active && cached) setRaw((cur) => cur || cached);
    });
    return () => { active = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, tick]);

  const displayCurrency = settings.currency;
  const data = useMemo(() => {
    if (!raw) return null;
    const { list, assets, liabilities, netWorth, multiCurrency } = computeBalances(
      raw.accounts, raw.expenses, raw.incomes, raw.transfers,
      { convert, displayCurrency }
    );
    const accounts = list.map((a) => ({
      id: a.id, name: a.name, type: a.type || 'Account', color: a.color || '200 70% 50%',
      icon: accountIcon(a.type), balance: a.balance, initialBalance: Number(a.initial_balance || 0),
      currency: a.currency, credit: a.credit, isActive: a.isActive,
    }));
    return { accounts, netAssets: assets, netLiabs: liabilities, netWorth, multiCurrency, displayCurrency };
  }, [raw, convert, displayCurrency]);

  return { data, loading, error, reload: load };
}
