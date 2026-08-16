import { deviceRegion, guessCurrency } from './locale';

// Region/context registry — the foundation that makes SafeSpend global-first.
// Given a country, it answers: what currency, what auto-capture methods are
// relevant here, and which one to lead with. New markets = add an entry, not a
// rewrite. Everything downstream (capture UI, categorization, insights, the coach)
// reads region context from here via RegionContext.

// The kinds of ways a transaction can enter the app. `available` reflects what's
// actually shipped today; `sms`/`aggregator` are declared so the UI can show
// "coming soon" and the roadmap is visible in the product.
export const CAPTURE_METHODS = {
  import_message: { id: 'import_message', label: 'Import from a message', icon: 'messageCircle', status: 'available', blurb: 'Paste a bank / M-Pesa transaction text — we auto-fill it.' },
  manual: { id: 'manual', label: 'Add manually', icon: 'plus', status: 'available', blurb: 'Type it in, or use quick-add.' },
  receipt: { id: 'receipt', label: 'Scan receipts', icon: 'camera', status: 'available', blurb: 'Snap a receipt — AI fills in the details.' },
  sms: { id: 'sms', label: 'Auto-read SMS', icon: 'messageCircle', status: 'coming_soon', blurb: 'Capture bank / mobile-money texts fully automatically.' },
  aggregator: { id: 'aggregator', label: 'Connect your bank', icon: 'landmark', status: 'coming_soon', blurb: 'Securely link your bank to import transactions.' },
  email: { id: 'email', label: 'Email receipts', icon: 'mail', status: 'coming_soon', blurb: 'Forward order confirmations to auto-log them.' },
};

// Per-region config. `capture` is ordered by what to lead with in that market.
// `aggregator` names the open-finance provider we'd wire for that region later.
// Countries not listed fall back to DEFAULT_REGION.
const AFRICA_MOBILE_MONEY = { currency: null, capture: ['sms', 'receipt', 'manual'], aggregator: 'mono', tags: ['mobile-money'] };

export const REGION_CONFIG = {
  // East / West / Southern Africa — mobile money + bank SMS dominate.
  KE: { currency: 'KES', capture: ['sms', 'receipt', 'manual'], aggregator: 'mono', tags: ['m-pesa'] },
  TZ: { currency: null, capture: ['sms', 'receipt', 'manual'], aggregator: 'mono', tags: ['m-pesa', 'mobile-money'] },
  UG: { ...AFRICA_MOBILE_MONEY },
  GH: { ...AFRICA_MOBILE_MONEY },
  NG: { currency: 'NGN', capture: ['sms', 'aggregator', 'receipt', 'manual'], aggregator: 'mono', tags: ['mobile-money'] },
  ZA: { currency: 'ZAR', capture: ['sms', 'aggregator', 'receipt', 'manual'], aggregator: 'stitch' },
  // South / SE Asia — bank + UPI SMS alerts are universal.
  IN: { currency: 'INR', capture: ['sms', 'receipt', 'manual'], aggregator: null, tags: ['upi'] },
  PH: { currency: 'PHP', capture: ['sms', 'receipt', 'manual'], aggregator: null },
  SG: { currency: 'SGD', capture: ['aggregator', 'receipt', 'manual'], aggregator: 'saltedge' },
  // Developed open-banking markets — aggregation leads.
  US: { currency: 'USD', capture: ['aggregator', 'receipt', 'manual'], aggregator: 'plaid' },
  CA: { currency: 'CAD', capture: ['aggregator', 'receipt', 'manual'], aggregator: 'plaid' },
  GB: { currency: 'GBP', capture: ['aggregator', 'receipt', 'manual'], aggregator: 'truelayer' },
  AU: { currency: 'AUD', capture: ['aggregator', 'receipt', 'manual'], aggregator: 'basiq' },
  AE: { currency: 'AED', capture: ['sms', 'receipt', 'manual'], aggregator: 'leantech' },
};

// Eurozone / broader EU — one shared profile.
const EU_PROFILE = { currency: 'EUR', capture: ['aggregator', 'receipt', 'manual'], aggregator: 'truelayer' };
['DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'PT', 'AT', 'BE', 'FI', 'GR', 'SK', 'SI', 'LU', 'LV', 'LT', 'EE', 'CY', 'MT', 'HR']
  .forEach((c) => { if (!REGION_CONFIG[c]) REGION_CONFIG[c] = { ...EU_PROFILE }; });

// The safe fallback for any country we haven't tuned yet: manual + receipts.
export const DEFAULT_REGION = { currency: 'USD', capture: ['receipt', 'manual'], aggregator: null, tags: [] };

/** Resolve a country code (ISO-2) to its region config, with the global fallback. */
export function resolveRegion(country) {
  const cc = String(country || '').toUpperCase();
  return { country: cc || null, ...(REGION_CONFIG[cc] || DEFAULT_REGION) };
}

/** Best-effort device country (ISO-2) from the OS locale; '' if unknown. */
export function detectCountry() {
  return deviceRegion();
}

/**
 * The best default display currency for a country.
 *
 * REGION_CONFIG is the single source of truth: it already declares each market's
 * currency, but nothing used to read it — the only wiring was a separate
 * device-locale map in locale.js that falls back to USD. So a user whose country
 * resolved to Kenya (including via the in-app country picker, which the locale
 * map never sees) still got USD totals over their KES accounts. Prefer the
 * region's own currency, then the locale guess, then USD.
 */
export function currencyForCountry(country, supportedCodes) {
  const region = resolveRegion(country);
  if (region.currency && (!supportedCodes || supportedCodes.includes(region.currency))) {
    return region.currency;
  }
  return guessCurrency(supportedCodes);
}

/** The ordered, resolved capture methods (with status/label) for a country.
 *  `import_message` (paste/share) is available everywhere, so it's always included. */
export function captureMethodsFor(country) {
  const region = resolveRegion(country);
  const ids = region.capture.includes('import_message') ? region.capture : ['import_message', ...region.capture];
  return ids.map((id) => CAPTURE_METHODS[id]).filter(Boolean);
}
