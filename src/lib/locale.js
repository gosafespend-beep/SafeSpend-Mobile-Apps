import { NativeModules, Platform } from 'react-native';

// Region → currency for the 18 currencies SafeSpend supports. Eurozone members
// all map to EUR. Anything unmapped falls back to USD.
const REGION_TO_CURRENCY = {
  US: 'USD', GB: 'GBP', KE: 'KES', NG: 'NGN', ZA: 'ZAR', IN: 'INR',
  CA: 'CAD', AU: 'AUD', NZ: 'AUD', JP: 'JPY', CN: 'CNY', HK: 'CNY',
  CH: 'CHF', LI: 'CHF', MX: 'MXN', BR: 'BRL', KR: 'KRW', AE: 'AED',
  SG: 'SGD', PH: 'PHP',
  // Eurozone
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR',
  PT: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR', SK: 'EUR',
  SI: 'EUR', LU: 'EUR', LV: 'EUR', LT: 'EUR', EE: 'EUR', CY: 'EUR', MT: 'EUR',
};

// Zero-dependency device locale (avoids pulling in expo-localization / a native
// rebuild). Android exposes it on I18nManager; iOS on SettingsManager.
function rawLocale() {
  try {
    if (Platform.OS === 'android') {
      return NativeModules.I18nManager?.localeIdentifier || '';
    }
    const s = NativeModules.SettingsManager?.settings;
    return s?.AppleLocale || (s?.AppleLanguages && s.AppleLanguages[0]) || '';
  } catch {
    return '';
  }
}

/** Best-effort ISO region (e.g. "KE") parsed from the device locale, or ''. */
export function deviceRegion() {
  const loc = rawLocale().replace(/-/g, '_'); // "en_KE" | "en_KE_#..." | "en"
  const m = loc.match(/_([A-Za-z]{2})(?:[_#]|$)/);
  return m ? m[1].toUpperCase() : '';
}

/**
 * Guess a supported currency code from the device region, defaulting to USD.
 * Pass the supported-code list to guarantee we never return an unlisted code.
 */
export function guessCurrency(supportedCodes) {
  const code = REGION_TO_CURRENCY[deviceRegion()];
  if (code && (!supportedCodes || supportedCodes.includes(code))) return code;
  return 'USD';
}
