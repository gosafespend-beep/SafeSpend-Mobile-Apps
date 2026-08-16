import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

/**
 * RevenueCat store-billing wiring for SafeSpend (Play Billing on Android,
 * StoreKit on iOS).
 *
 * The public SDK keys below are *client* keys and are safe to ship in the app
 * (same as the Supabase anon key in ./supabase.js). They are NOT the secret API
 * key — never put the secret key in the app.
 *
 * Keys come from RevenueCat → Project settings → Apps → Show key.
 *   - Android: "goog_…"  → SafeSpend (Play Store),  com.safespend.app
 *   - iOS:     "appl_…"  → SafeSpend (App Store),   com.safespend.ios
 * Leave a key as "" to disable RevenueCat on that platform; the app then falls
 * back to the Supabase `subscriptions` table for entitlement (web/Paystack).
 */
const REVENUECAT_API_KEYS = {
  android: 'goog_dCbZJwbGeeXTialaRJlQWHmFnge',
  ios: 'appl_zICcYsxVtMPiZxFBUqnzoageYqg',
};

// The entitlement identifier configured in RevenueCat (Entitlements tab).
export const ENTITLEMENT_ID = 'premium';

/**
 * The storefront that actually bills the user on this platform. Apple rejects
 * iOS builds that mention another store (App Review 2.3.1 / 3.1.1), so every
 * user-facing string about billing MUST go through this — never hardcode
 * "Google Play".
 */
export const STORE_NAME = Platform.select({ ios: 'the App Store', android: 'Google Play' }) || 'the store';
/** Capitalised form for the start of a sentence ("The App Store reminds you…"). */
export const STORE_NAME_CAP = Platform.select({ ios: 'The App Store', android: 'Google Play' }) || 'The store';
/** What the platform calls the account that owns the purchase. */
export const STORE_ACCOUNT = Platform.select({ ios: 'Apple Account', android: 'Google account' }) || 'store account';

const apiKey = Platform.select(REVENUECAT_API_KEYS) || '';
// A key is "real" once it's been replaced with an actual RevenueCat key.
const hasValidKey = !!apiKey && !apiKey.includes('REPLACE_WITH');

/**
 * Whether in-app purchases can work at all on this build (a store key is
 * present). False on a platform whose key hasn't been pasted yet — the paywall
 * uses this to avoid showing a Buy button that can only fail, which is itself
 * an App Review rejection (3.1.1).
 */
export function isStoreConfigured() {
  return hasValidKey;
}

let configured = false;

/** True once RevenueCat is usable (valid key present + configured). */
export function isRevenueCatReady() {
  return configured;
}

/**
 * Configure RevenueCat once at app startup. Safe to call before login — we log
 * the specific user in later via rcLogIn(). No-ops if the key isn't set yet, so
 * the app runs fine before you paste your key.
 */
export function configureRevenueCat() {
  if (configured || !hasValidKey) return;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey });
    configured = true;
  } catch (e) {
    if (__DEV__) console.warn('[revenuecat] configure failed:', e?.message);
  }
}

/** Associate purchases with the signed-in Supabase user id. */
export async function rcLogIn(userId) {
  if (!configured || !userId) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    if (__DEV__) console.warn('[revenuecat] logIn failed:', e?.message);
  }
}

/** Reset to an anonymous id on sign-out so the next user starts clean. */
export async function rcLogOut() {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    // logOut throws if already anonymous — harmless.
    if (__DEV__) console.warn('[revenuecat] logOut:', e?.message);
  }
}

/** Whether the given customerInfo grants Premium. */
export function hasPremiumEntitlement(customerInfo) {
  return !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
}

/**
 * Deep link to where the user manages/cancels the subscription on THIS
 * platform. Apple requires iOS subs be managed in the App Store account
 * settings; Play wants the sku+package so it lands on the right row.
 */
export function manageSubscriptionsUrl(sku, androidPackage) {
  if (Platform.OS === 'ios') return 'https://apps.apple.com/account/subscriptions';
  const base = 'https://play.google.com/store/account/subscriptions';
  return sku && androidPackage ? `${base}?sku=${sku}&package=${androidPackage}` : base;
}
