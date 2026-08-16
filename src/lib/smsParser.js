// Transaction-message parser — turns a bank / mobile-money SMS into a draft
// transaction. Heuristic and config-extensible: it recognises M-Pesa (Kenya +
// East Africa), generic mobile-money, and generic bank debit/credit alerts, and
// is intentionally decoupled from *how* the text is obtained (paste, share, and —
// later, subject to platform policy — SMS read). The parser is the reusable core;
// new formats are added here (and can later be served from the backend so a new
// bank's format ships without an app update).

// Currency token → ISO code (order matters: multi-char before single symbols).
const CURRENCY_TOKENS = [
  [/ksh|kes|k\.sh/i, 'KES'], [/tsh|tzs/i, 'TZS'], [/ush|ugx/i, 'UGX'], [/ngn|₦/i, 'NGN'],
  [/zar|\br\b/i, 'ZAR'], [/ghs|gh₵|₵/i, 'GHS'], [/inr|rs\.?|₹/i, 'INR'], [/php|₱/i, 'PHP'],
  [/aed|dhs/i, 'AED'], [/gbp|£/i, 'GBP'], [/eur|€/i, 'EUR'], [/usd|\$/i, 'USD'],
];

// Amount preceded by a currency token, e.g. "Ksh1,500.00", "INR 2,000", "$45.20".
const AMOUNT_RE = /(ksh|kes|tsh|tzs|ush|ugx|ngn|₦|zar|ghs|₵|inr|rs\.?|₹|php|₱|aed|gbp|£|eur|€|usd|\$)\s?([\d,]+(?:\.\d{1,2})?)/i;

const INCOME_HINTS = /\b(received|credited|credit|deposit(?:ed)?|refund(?:ed)?|reversal|salary)\b/i;
const EXPENSE_HINTS = /\b(sent to|paid to|paid|payment|withdraw(?:n|al)?|bought|debited|debit|purchase|spent|transferred to)\b/i;

function detectCurrency(token) {
  const t = String(token || '').trim();
  for (const [re, code] of CURRENCY_TOKENS) if (re.test(t)) return code;
  return null;
}

function cleanName(s) {
  return String(s || '')
    .replace(/\b(on|for account|for|new|balance|avl|available|a\/c|acct|account)\b.*$/i, '')
    .replace(/\s+\+?\d[\d\s-]{5,}\d\s*$/, '') // trailing phone number
    .replace(/[.,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a transaction message. Returns a draft { amount, currency, type,
 * counterparty, note, balance, ref } or null if it doesn't look like one.
 */
export function parseTransactionSms(text, { defaultCurrency = 'USD' } = {}) {
  const raw = String(text || '').trim();
  if (raw.length < 8) return null;

  const amountMatch = raw.match(AMOUNT_RE);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[2].replace(/,/g, ''));
  if (!amount || amount <= 0) return null;
  const currency = detectCurrency(amountMatch[1]) || defaultCurrency;

  // Type: income unless it clearly reads as an outgoing payment.
  const looksIncome = INCOME_HINTS.test(raw) && !/\b(sent to|paid to|paid|withdraw)\b/i.test(raw);
  const type = looksIncome ? 'income' : 'expense';

  // Counterparty / merchant.
  let counterparty = null;
  if (type === 'expense') {
    const m = raw.match(/(?:paid to|sent to|withdrawn from|payment to|to)\s+([A-Za-z0-9][A-Za-z0-9 &._'-]{2,40})/i);
    if (m) counterparty = cleanName(m[1]);
  } else {
    const m = raw.match(/(?:from)\s+([A-Za-z0-9][A-Za-z0-9 &._'-]{2,40})/i);
    if (m) counterparty = cleanName(m[1]);
  }

  // Balance after (optional).
  const balMatch = raw.match(/balance(?:\s+is)?\s*(?:[A-Za-z.$₦₹£€₱₵]{0,5})?\s?([\d,]+(?:\.\d{1,2})?)/i);
  const balance = balMatch ? parseFloat(balMatch[1].replace(/,/g, '')) : null;

  // Reference (M-Pesa code at the start, or an explicit Ref/Txn id — word-bounded
  // so it doesn't match the "id" inside words like "paid").
  const refMatch = raw.match(/^([A-Z0-9]{9,12})\b/) || raw.match(/\b(?:ref|txn|transaction\s*id)\b[:\s]+([A-Za-z0-9]+)/i);
  const ref = refMatch ? refMatch[1] : null;

  return {
    amount,
    currency,
    type,
    counterparty: counterparty || null,
    note: counterparty || (type === 'income' ? 'Received' : 'Payment'),
    balance,
    ref,
  };
}
