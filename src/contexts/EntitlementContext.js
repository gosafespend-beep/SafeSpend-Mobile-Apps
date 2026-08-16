import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Linking } from 'react-native';
import Purchases from 'react-native-purchases';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  ENTITLEMENT_ID, isRevenueCatReady, isStoreConfigured, hasPremiumEntitlement,
  manageSubscriptionsUrl, STORE_NAME,
} from '../lib/revenuecat';
import { track } from '../lib/analytics';

// Android-only: the Play package whose subscription row we deep-link to.
// (iOS manages subs in the Apple Account settings — see manageSubscriptionsUrl.)
const ANDROID_PACKAGE_NAME = 'com.safespend.app';

const EntitlementContext = createContext(null);

/**
 * The single entitlement source of truth for the whole app. Replaces the old
 * per-screen `useSubscription()` fetches (which could disagree — the paywall,
 * the profile badge, and gating each resolved Premium slightly differently).
 *
 * Model: a 7-day store free-trial subscription (Play Billing on Android,
 * StoreKit on iOS). `canWrite` is simply
 * `isPremium` — during the trial RevenueCat reports the entitlement as active,
 * so trialists can write; once the trial lapses (or a non-subscriber signs in)
 * the app is read-only until they subscribe. Reads and export stay free.
 */
export function EntitlementProvider({ children }) {
  const { user } = useAuth();
  const [sub, setSub] = useState(null);                    // Supabase row (web/Paystack)
  const [customerInfo, setCustomerInfo] = useState(null);  // RevenueCat / Play
  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paywall, setPaywall] = useState({ open: false, source: null });

  /*
   * REV-1: ask the database for the resolved entitlement rather than reading
   * the Paystack table directly.
   *
   * Mobile already OR'd this with the RevenueCat SDK, so it was not broken the
   * way the web app was -- but it still meant two clients implementing the
   * same rule slightly differently. `my_entitlement()` covers both providers,
   * so a purchase made anywhere is honoured here even before the RC SDK has
   * refreshed (fresh install, offline start, sign-in on a new device).
   */
  const loadSupabase = useCallback(async () => {
    if (!user) { setSub(null); return; }
    const { data, error } = await supabase.rpc('my_entitlement').maybeSingle();
    if (error) {
      console.warn('[entitlement] resolve failed:', error.message);
      setSub(null);
      return;
    }
    setSub(data || null);
  }, [user]);

  const loadRevenueCat = useCallback(async () => {
    if (!isRevenueCatReady()) return;
    try {
      const [info, offs] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      setCustomerInfo(info);
      setOfferings(offs);
    } catch (e) {
      if (__DEV__) console.warn('[entitlement] RC load:', e?.message);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSupabase(), loadRevenueCat()]);
    setLoading(false);
  }, [loadSupabase, loadRevenueCat]);

  useEffect(() => { load(); }, [load]);

  // Live store updates (purchase / renewal / expiry) push straight in.
  useEffect(() => {
    if (!isRevenueCatReady()) return;
    const listener = (info) => setCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => Purchases.removeCustomerInfoUpdateListener(listener);
  }, []);

  const entitlement = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] || null;

  /*
   * `sub` is now the resolved entitlement from my_entitlement(), which already
   * accounts for both providers. The RevenueCat SDK is still OR'd in because
   * it reflects a purchase on-device immediately, before the webhook has
   * round-tripped -- so the paywall dismisses without waiting on the network.
   */
  const supaActive = sub?.is_premium === true;
  const supaTrialing = sub?.is_trialing === true;
  const rcActive = hasPremiumEntitlement(customerInfo);

  const isPremium = rcActive || supaActive;
  const rcTrialing = !!entitlement && String(entitlement.periodType).toLowerCase().includes('trial');
  const isTrialing = supaTrialing || rcTrialing;

  const packageFor = useCallback((planType) => {
    const cur = offerings?.current;
    if (!cur) return null;
    if (planType === 'annual') {
      return cur.annual || cur.availablePackages?.find((p) => p.packageType === 'ANNUAL') || null;
    }
    return cur.monthly || cur.availablePackages?.find((p) => p.packageType === 'MONTHLY') || null;
  }, [offerings]);

  const annualProductId = packageFor('annual')?.product?.identifier;
  const monthlyProductId = packageFor('monthly')?.product?.identifier;

  // Trial eligibility: a store account that has already bought (or trialed) the
  // sub can't get the free trial again — don't advertise "7-day free trial" to
  // them. `allPurchasedProductIdentifiers` is RC's durable purchase history.
  const purchased = customerInfo?.allPurchasedProductIdentifiers || [];
  const trialEligible = !purchased.some(
    (id) => id === annualProductId || id === monthlyProductId || String(id).toLowerCase().includes('premium')
  );

  const prices = {
    annual: packageFor('annual')?.product?.priceString || null,
    monthly: packageFor('monthly')?.product?.priceString || null,
  };

  // Can this build actually complete a purchase? Requires both a store key for
  // the platform AND a loaded offering. Showing a Buy button that can only fail
  // is an App Review rejection (3.1.1), so the paywall gates its CTA on this.
  const canPurchase = isStoreConfigured() && !!(packageFor('annual') || packageFor('monthly'));

  const subscribe = useCallback(async (planType) => {
    if (!isRevenueCatReady()) return { ok: false, error: 'In-app purchases are not available yet.' };
    const pkg = packageFor(planType);
    if (!pkg) return { ok: false, error: 'This plan is not available right now.' };
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);
      loadSupabase();
      if (hasPremiumEntitlement(info)) return { ok: true };
      // Play "slow" payments (bank/family approval) resolve later via the update
      // listener — treat as pending, not a hard failure.
      return { ok: false, pending: true };
    } catch (e) {
      if (e?.userCancelled) return { ok: false, cancelled: true };
      return { ok: false, error: e?.message || 'Purchase failed.' };
    }
  }, [packageFor, loadSupabase]);

  const restore = useCallback(async () => {
    if (!isRevenueCatReady()) return { ok: false, error: 'In-app purchases are not available yet.' };
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return { ok: hasPremiumEntitlement(info) };
    } catch (e) {
      return { ok: false, error: e?.message || 'Could not restore purchases.' };
    }
  }, []);

  const cancel = useCallback(async () => {
    if (rcActive) {
      // Store-billed subs are cancelled in the storefront, never in-app.
      const url = manageSubscriptionsUrl(entitlement?.productIdentifier, ANDROID_PACKAGE_NAME);
      try { await Linking.openURL(url); return { ok: true, external: true }; }
      catch { return { ok: false, error: `Could not open ${STORE_NAME}.` }; }
    }
    try {
      const { data, error } = await supabase.functions.invoke('paystack-manage', { body: { action: 'cancel' } });
      if (error || data?.error) {
        // supabase-js wraps any non-2xx edge-function response in a generic
        // FunctionsHttpError ("Edge Function returned a non-2xx status code") —
        // the real reason lives in the response body, not error.message.
        let reason = data?.error;
        if (!reason && error?.context?.json) {
          try { reason = (await error.context.json())?.error; } catch { /* body already read or not JSON */ }
        }
        return { ok: false, error: reason || error?.message };
      }
      await loadSupabase();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [rcActive, entitlement, loadSupabase]);

  // my_entitlement() returns `period_end` (resolved across providers), not the
  // Paystack-specific `current_period_end` this used to read.
  const currentPeriodEnd = entitlement?.expirationDate || sub?.period_end || null;
  const planType = rcActive
    ? (entitlement?.productIdentifier === annualProductId
        || String(entitlement?.productIdentifier).toLowerCase().includes('annual') ? 'annual' : 'monthly')
    : sub?.plan_type;

  const planLabel = !isPremium ? 'Free'
    : isTrialing ? 'Free trial'
    : `Premium · ${planType || 'active'}`;

  // ── Paywall presentation (works from anywhere, incl. sheets) ──────────────
  const presentPaywall = useCallback((source = 'unknown') => {
    track('paywall_view', { source });
    setPaywall({ open: true, source });
  }, []);
  const dismissPaywall = useCallback(() => setPaywall({ open: false, source: null }), []);

  /** Run `action` if the user can write; otherwise open the paywall. */
  const requireWrite = useCallback((source, action) => {
    if (isPremium) { action && action(); return true; }
    presentPaywall(source);
    return false;
  }, [isPremium, presentPaywall]);

  const value = useMemo(() => ({
    loading,
    isPremium,
    isTrialing,
    canWrite: isPremium,
    status: isPremium ? (isTrialing ? 'trialing' : 'active') : 'free',
    planType,
    planLabel,
    currentPeriodEnd,
    prices,
    trialEligible,
    canPurchase,
    managedByStore: rcActive,
    subscribe,
    cancel,
    restore,
    reload: load,
    presentPaywall,
    dismissPaywall,
    requireWrite,
    paywall,
  }), [loading, isPremium, isTrialing, planType, planLabel, currentPeriodEnd, prices, trialEligible, canPurchase, rcActive, subscribe, cancel, restore, load, presentPaywall, dismissPaywall, requireWrite, paywall]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  // Fail closed like every sibling context (useAuth/useSettings/useAppLock, etc.)
  // — a consumer mounted outside the provider must error loudly at dev time,
  // not silently grant unlimited premium write access.
  if (ctx === undefined || ctx === null) throw new Error('useEntitlement must be used within an EntitlementProvider');
  return ctx;
}
