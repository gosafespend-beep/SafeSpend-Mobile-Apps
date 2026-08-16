import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { setDefaultCents, setHideBalances as applyHideBalances } from '../lib/format';
import { applyThemeMode } from '../theme/tokens';

// 'system' resolves to the device color scheme; anything else is taken literally.
function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

const SettingsContext = createContext(undefined);

const DEFAULTS = {
  currency: 'USD', dateFormat: 'MM/DD/YYYY', theme: 'dark', showCents: true,
  startOfWeek: 'sunday', budgetStartMonth: 0, budgetStartYear: new Date().getFullYear(),
  hideBalances: false, budgetRollover: false,
};
const SHOW_CENTS_KEY = 'pref_show_cents';
const START_OF_WEEK_KEY = 'pref_start_of_week';
const HIDE_BALANCES_KEY = 'pref_hide_balances';
const BUDGET_ROLLOVER_KEY = 'pref_budget_rollover';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "January 2026 – December 2026" style label for the 12-month budget cycle.
export function budgetPeriodLabel(month, year) {
  const startM = MONTHS[month] || MONTHS[0];
  const endMonthIdx = (month + 11) % 12;
  const endYear = month === 0 ? year : year + 1;
  return `${startM} ${year} – ${MONTHS[endMonthIdx]} ${endYear}`;
}

// Mirror of the web app's convention: a user_settings row existing == onboarded.
export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULTS);
  const [isOnboardingComplete, setOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [themeVersion, setThemeVersion] = useState(0); // bump forces a themed re-render

  const apply = useCallback((s) => {
    setSettings(s);
    setDefaultCents(s.showCents);
    applyHideBalances(s.hideBalances);
    applyThemeMode(resolveTheme(s.theme));
    setThemeVersion((v) => v + 1);
  }, []);

  // Follow the OS light/dark switch while the user is on "system".
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (settings.theme !== 'light' && settings.theme !== 'dark') {
        applyThemeMode(resolveTheme(settings.theme));
        setThemeVersion((v) => v + 1);
      }
    });
    return () => sub.remove();
  }, [settings.theme]);

  const reload = useCallback(async () => {
    if (!user) { apply(DEFAULTS); setOnboarded(false); setLoading(false); return; }
    setLoading(true);
    const [{ data }, storedCents, storedSow, storedHide, storedRollover] = await Promise.all([
      supabase.from('user_settings').select('currency, date_format, theme, budget_start_month, budget_start_year').eq('user_id', user.id).maybeSingle(),
      AsyncStorage.getItem(SHOW_CENTS_KEY),
      AsyncStorage.getItem(START_OF_WEEK_KEY),
      AsyncStorage.getItem(HIDE_BALANCES_KEY),
      AsyncStorage.getItem(BUDGET_ROLLOVER_KEY),
    ]);
    const showCents = storedCents == null ? true : storedCents === 'true';
    const startOfWeek = storedSow === 'monday' ? 'monday' : 'sunday';
    const hideBalances = storedHide === 'true';
    const budgetRollover = storedRollover === 'true';
    if (data) {
      apply({
        currency: data.currency || 'USD', dateFormat: data.date_format || 'MM/DD/YYYY', theme: data.theme || 'dark',
        showCents, startOfWeek, hideBalances, budgetRollover,
        budgetStartMonth: data.budget_start_month ?? 0,
        budgetStartYear: data.budget_start_year ?? new Date().getFullYear(),
      });
      setOnboarded(true);
    } else {
      apply({ ...DEFAULTS, showCents, startOfWeek, hideBalances, budgetRollover });
      setOnboarded(false);
    }
    setLoading(false);
  }, [user, apply]);

  useEffect(() => { reload(); }, [reload]);

  const completeOnboarding = useCallback(async (currency = 'USD') => {
    if (!user) return { error: new Error('Not signed in') };
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, currency }, { onConflict: 'user_id' });
    if (!error) { setSettings((s) => ({ ...s, currency })); setOnboarded(true); }
    return { error };
  }, [user]);

  // Persist a DB-backed preference (currency / date_format / theme).
  const updateSetting = useCallback(async (patch) => {
    if (!user) return { error: new Error('Not signed in') };
    setSettings((s) => { const next = { ...s, ...patch }; setDefaultCents(next.showCents); return next; });
    if (patch.theme != null) { applyThemeMode(resolveTheme(patch.theme)); setThemeVersion((v) => v + 1); }
    const dbPatch = {};
    if (patch.currency != null) dbPatch.currency = patch.currency;
    if (patch.dateFormat != null) dbPatch.date_format = patch.dateFormat;
    if (patch.theme != null) dbPatch.theme = patch.theme;
    if (patch.budgetStartMonth != null) dbPatch.budget_start_month = patch.budgetStartMonth;
    if (patch.budgetStartYear != null) dbPatch.budget_start_year = patch.budgetStartYear;
    if (Object.keys(dbPatch).length) {
      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, ...dbPatch }, { onConflict: 'user_id' });
      return { error };
    }
    return { error: null };
  }, [user]);

  const setShowCents = useCallback(async (v) => {
    setSettings((s) => ({ ...s, showCents: v }));
    setDefaultCents(v);
    await AsyncStorage.setItem(SHOW_CENTS_KEY, v ? 'true' : 'false');
  }, []);

  // Start of week is a client-only preference (no DB column), mirroring the web app.
  const setStartOfWeek = useCallback(async (v) => {
    setSettings((s) => ({ ...s, startOfWeek: v }));
    await AsyncStorage.setItem(START_OF_WEEK_KEY, v);
  }, []);

  // Privacy mode — masks amounts everywhere; bump themeVersion so the whole tree re-renders.
  const setHideBalances = useCallback(async (v) => {
    setSettings((s) => ({ ...s, hideBalances: v }));
    applyHideBalances(v);
    setThemeVersion((x) => x + 1);
    await AsyncStorage.setItem(HIDE_BALANCES_KEY, v ? 'true' : 'false');
  }, []);

  // Envelope rollover — carry each category's unused (or overspent) budget into
  // the next month. Client-only preference (no DB column), like start-of-week.
  const setBudgetRollover = useCallback(async (v) => {
    setSettings((s) => ({ ...s, budgetRollover: v }));
    await AsyncStorage.setItem(BUDGET_ROLLOVER_KEY, v ? 'true' : 'false');
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, isOnboardingComplete, completeOnboarding, updateSetting, setShowCents, setStartOfWeek, setHideBalances, setBudgetRollover, reload, themeVersion }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (ctx === undefined) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
