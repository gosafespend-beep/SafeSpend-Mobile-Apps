// Lightweight natural-language transaction parser for quick-add.
// "coffee 4.50" / "spent 20 on lunch" / "5000 salary" → { amount, type, note }.
// Purely client-side heuristic — no network, works offline.

const INCOME_WORDS = ['income', 'salary', 'paycheck', 'payslip', 'refund', 'received', 'deposit', 'bonus', 'dividend', 'interest', 'earned', 'got paid'];

export function parseNaturalLanguage(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // Grab the first number that looks like money (optional decimals, thousands separators).
  const amountMatch = raw.match(/(\d[\d,]*(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (!amount || amount <= 0) return null;

  const lower = raw.toLowerCase();
  const type = INCOME_WORDS.some((w) => lower.includes(w)) ? 'income' : 'expense';

  // Note = the text with the amount and common filler words removed.
  let note = raw
    .replace(amountMatch[0], ' ')
    .replace(/\b(spent|paid|for|on|of|the|a|an|got|received|income|expense)\b/gi, ' ')
    .replace(/[$£€¥]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Title-case the first word for a tidy note.
  if (note) note = note.charAt(0).toUpperCase() + note.slice(1);

  return { amount, type, note };
}
