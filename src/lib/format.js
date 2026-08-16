/* Currency + number formatting.
   Defaults to USD (matches the kit's seed data); pass a currency code, or use
   useMoney() from SettingsContext, to format in the signed-in user's currency. */

/**
 * Parse a store-localized price string ("$89.99", "KSh 1,200.50", "€9,99",
 * "TZS 25,000") into { value, prefix, spaced }. Used by the paywall to compute
 * REAL savings % and per-month equivalents from Google Play's regional prices —
 * never hardcode those claims. Returns null when the string can't be parsed.
 */
export function parsePrice(str) {
  const s = String(str || '');
  const m = s.match(/(\d[\d., \s]*\d|\d)/);
  if (!m) return null;
  const raw = m[1].replace(/[ \s]/g, '');
  // The last '.' or ',' is a decimal separator only if ≤2 digits follow it.
  const sep = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  let value;
  if (sep > -1 && raw.length - sep - 1 <= 2) {
    value = parseFloat(raw.slice(0, sep).replace(/[.,]/g, '') + '.' + raw.slice(sep + 1));
  } else {
    value = parseFloat(raw.replace(/[.,]/g, ''));
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  const idx = s.indexOf(m[1]);
  const prefix = s.slice(0, idx).trim();
  const spaced = idx > 0 && /[\s ]/.test(s[idx - 1]);
  return { value, prefix, spaced };
}

/** Format a number in the same style as a parsed price ("KSh" + spaced → "KSh 7.50"). */
export function formatLikePrice(value, parts, decimals = 2) {
  const n = value.toFixed(decimals);
  if (!parts?.prefix) return n;
  return `${parts.prefix}${parts.spaced ? ' ' : ''}${n}`;
}

export const CURRENCIES = {
  USD: { locale: 'en-US' }, EUR: { locale: 'de-DE' }, GBP: { locale: 'en-GB' },
  JPY: { locale: 'ja-JP' }, CAD: { locale: 'en-CA' }, AUD: { locale: 'en-AU' },
  CHF: { locale: 'de-CH' }, CNY: { locale: 'zh-CN' }, INR: { locale: 'en-IN' },
  MXN: { locale: 'es-MX' }, BRL: { locale: 'pt-BR' }, KRW: { locale: 'ko-KR' },
  KES: { locale: 'en-KE' }, NGN: { locale: 'en-NG' }, ZAR: { locale: 'en-ZA' },
  AED: { locale: 'ar-AE' }, SGD: { locale: 'en-SG' }, PHP: { locale: 'en-PH' },
};

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', country: 'United States' },
  { code: 'EUR', symbol: '€', name: 'Euro', country: 'European Union' },
  { code: 'GBP', symbol: '£', name: 'British Pound', country: 'United Kingdom' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', country: 'Kenya' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', country: 'Nigeria' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', country: 'South Africa' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', country: 'India' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', country: 'Canada' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', country: 'Australia' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', country: 'Japan' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', country: 'China' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', country: 'Switzerland' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', country: 'Mexico' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', country: 'Brazil' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', country: 'South Korea' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', country: 'United Arab Emirates' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', country: 'Singapore' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', country: 'Philippines' },
];

// App-wide "show cents" preference, set by SettingsContext. money() uses it when
// `cents` isn't explicitly passed, so every existing call respects the setting.
let _defaultCents = true;
export function setDefaultCents(v) { _defaultCents = !!v; }

// Privacy mode — when on, money() masks the amount everywhere (magnitude hidden).
// Pass `reveal: true` to a specific call to bypass it.
let _hideBalances = false;
export function setHideBalances(v) { _hideBalances = !!v; }
export function balancesHidden() { return _hideBalances; }

export function money(n, opts = {}) {
  const { cents = _defaultCents, sign = false, currency = 'USD', reveal = false } = opts;
  if (_hideBalances && !reveal) {
    const sym = currencySymbol(currency);
    const s = sign ? (n < 0 ? '-' : '+') : (n < 0 ? '-' : '');
    return `${s}${sym}••••`;
  }
  const info = CURRENCIES[currency] || CURRENCIES.USD;
  // When showing cents, let Intl use each currency's natural minor units
  // (USD/EUR → 2, JPY/KRW → 0). For compact display, force whole numbers.
  const fmtOpts = { style: 'currency', currency };
  if (!cents) { fmtOpts.minimumFractionDigits = 0; fmtOpts.maximumFractionDigits = 0; }
  const str = new Intl.NumberFormat(info.locale, fmtOpts).format(Math.abs(n));
  if (!sign) return n < 0 ? `-${str}` : str;
  return `${n < 0 ? '-' : '+'}${str}`;
}

export function moneyCompact(n, currency = 'USD') {
  return Math.abs(n) >= 1000 ? money(n, { cents: false, currency }) : money(n, { cents: true, currency });
}

export function fmt2(n) {
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmt0(n) {
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Serialize a value as a CSV field. Escapes embedded quotes AND neutralizes
 * spreadsheet formula injection: a cell beginning with = + - @ (or a leading
 * tab/CR) is treated as a formula by Excel/Sheets, so an exported note like
 * "=HYPERLINK(...)" could execute when the user opens their backup. Prefixing a
 * single quote forces the cell to render as literal text.
 */
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Just the currency symbol for a code, e.g. 'USD' -> '$', 'NGN' -> '₦'. */
export function currencySymbol(currency = 'USD') {
  const info = CURRENCIES[currency] || CURRENCIES.USD;
  try {
    const parts = new Intl.NumberFormat(info.locale, { style: 'currency', currency, maximumFractionDigits: 0 }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || '$';
  } catch {
    return '$';
  }
}
