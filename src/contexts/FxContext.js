import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { convert as convertRaw, fetchRates } from '../lib/fx';
import { useRefresh } from './RefreshContext';

/**
 * App-wide FX rates. Loaded once (stale-while-revalidate via AsyncStorage) and
 * refreshed on the same tick as everything else. `convert(amount, from, to)`
 * turns any stored amount into another currency; `stale` flags rates older than
 * a week so the UI can note it.
 */
const CACHE_KEY = 'fx-rates';
const FxContext = createContext({ rates: { USD: 1 }, convert: (a) => a, hasRate: () => true, ready: false, stale: false, fetchedAt: null });

export function FxProvider({ children }) {
  const { tick } = useRefresh();
  const [rates, setRates] = useState({ USD: 1 });
  const [fetchedAt, setFetchedAt] = useState(null);
  const [ready, setReady] = useState(false);

  const apply = useCallback((res, persist) => {
    if (!res || !res.rates || !Object.keys(res.rates).length) return;
    setRates(res.rates);
    setFetchedAt(res.fetchedAt || null);
    setReady(true);
    if (persist) AsyncStorage.setItem(CACHE_KEY, JSON.stringify(res)).catch(() => {});
  }, []);

  // Hydrate from cache immediately (offline / cold start), then refresh.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CACHE_KEY).then((raw) => {
      if (!active || !raw) return;
      try { apply(JSON.parse(raw), false); } catch { /* ignore */ }
    });
    return () => { active = false; };
  }, [apply]);

  useEffect(() => {
    fetchRates().then((res) => apply(res, true)).catch(() => {});
  }, [apply, tick]);

  const stale = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() > 7 * 86400000 : false;
  const convert = useCallback((amount, from, to) => convertRaw(amount, from, to, rates), [rates]);
  // True when this currency can actually be converted; a missing rate means
  // convert() silently falls back to 1:1 and the UI must warn, not imply "≈".
  const hasRate = useCallback((code) => !code || !!rates[code], [rates]);

  return <FxContext.Provider value={{ rates, convert, hasRate, ready, stale, fetchedAt }}>{children}</FxContext.Provider>;
}

export function useFx() {
  return useContext(FxContext);
}
