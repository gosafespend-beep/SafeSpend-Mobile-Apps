// SDK 54 made the new File/Directory API the default; this module uses the
// classic readAsStringAsync/writeAsStringAsync/cacheDirectory API, which now
// lives at the /legacy entry point.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { toLocalISODate } from './date';
import { fetchRates, convert as convertFx, toUsd } from './fx';
import { csvCell } from './format';
import { loadRules, applyRules } from './merchantRules';

// Minimal base64 -> Uint8Array (RN has no Buffer/atob for binary uploads).
function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = {};
  for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[clean[i]], e2 = lookup[clean[i + 1]];
    const e3 = lookup[clean[i + 2]], e4 = lookup[clean[i + 3]];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (clean[i + 2] != null) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (clean[i + 3] != null) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes.subarray(0, p);
}

const TABLES = [
  'accounts', 'categories', 'income_categories', 'expenses', 'incomes', 'transfers',
  'budgets', 'savings_goals', 'goal_contributions', 'debts', 'debt_payments',
  'bills', 'bill_statuses', 'recurring_transactions', 'assets', 'liabilities', 'networth_snapshots',
];

async function fetchTable(name, userId) {
  const { data } = await supabase.from(name).select('*').eq('user_id', userId);
  return data || [];
}

async function shareFile(filename, content, mime) {
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: filename });
  }
  return uri;
}

/** Export the full account as a JSON backup and open the share sheet. */
export async function exportJSON(userId) {
  const out = { app: 'SafeSpend', exportedAt: new Date().toISOString(), data: {} };
  for (const t of TABLES) out.data[t] = await fetchTable(t, userId);
  return shareFile(`safespend-backup-${Date.now()}.json`, JSON.stringify(out, null, 2), 'application/json');
}

/** Export transactions (income + expense) as CSV and open the share sheet. */
export async function exportTransactionsCSV(userId) {
  const [exp, inc] = await Promise.all([fetchTable('expenses', userId), fetchTable('incomes', userId)]);
  const rows = [
    ['Date', 'Type', 'Amount', 'Category', 'Note'],
    ...exp.map((e) => [e.date, 'Expense', e.amount, e.category || '', (e.note || '').replace(/"/g, "'")]),
    ...inc.map((i) => [i.date, 'Income', i.amount, i.source || i.category || '', (i.note || '').replace(/"/g, "'")]),
  ];
  rows.sort((a, b) => (a[0] === 'Date' ? -1 : b[0] === 'Date' ? 1 : a[0] < b[0] ? 1 : -1));
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  return shareFile(`safespend-transactions-${Date.now()}.csv`, csv, 'text/csv');
}

/** Permanently delete all of the user's financial data (keeps the account/login). */
export async function deleteAllData(userId) {
  // Delete children before parents to satisfy foreign keys.
  for (const t of [...TABLES].reverse()) {
    await supabase.from(t).delete().eq('user_id', userId);
  }
}

/** Open the file picker, read a SafeSpend JSON backup and validate it. */
export async function pickAndValidateBackup() {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const uri = res.assets[0].uri;
  const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  const data = parsed?.data;
  if (!data || typeof data !== 'object') throw new Error('This does not look like a SafeSpend backup.');
  const counts = {};
  let total = 0;
  for (const t of TABLES) {
    const n = Array.isArray(data[t]) ? data[t].length : 0;
    if (n) { counts[t] = n; total += n; }
  }
  if (total === 0) throw new Error('The backup contains no records.');
  return { data, counts, total, exportedAt: parsed.exportedAt || null };
}

/**
 * Import a validated backup. mode 'replace' wipes existing data first;
 * mode 'merge' upserts on top of it. Rows are re-owned by the current user.
 */
export async function importBackup(userId, data, mode = 'replace') {
  if (mode === 'replace') await deleteAllData(userId);
  const results = {};
  for (const t of TABLES) {
    const rows = Array.isArray(data[t]) ? data[t] : [];
    if (!rows.length) continue;
    const owned = rows.map((r) => ({ ...r, user_id: userId }));
    const { error } = await supabase.from(t).upsert(owned, { onConflict: 'id' });
    results[t] = error ? error.message : 'ok';
  }
  return results;
}

// Split one CSV line, honoring double-quoted fields that may contain commas.
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const findCol = (headers, names) => headers.findIndex((h) => names.includes(norm(h)));

// Parse a common-format transactions CSV into normalized rows. Recognizes the
// SafeSpend export (Date,Type,Amount,Category,Note) and typical bank columns.
function parseTransactionsCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error('The CSV has no data rows.');
  const headers = parseCsvLine(lines[0]);
  const iDate = findCol(headers, ['date', 'transactiondate', 'posteddate']);
  const iAmount = findCol(headers, ['amount', 'value']);
  const iType = findCol(headers, ['type', 'transactiontype']);
  const iCat = findCol(headers, ['category', 'source']);
  const iNote = findCol(headers, ['note', 'description', 'memo', 'details', 'narration']);
  const iDebit = findCol(headers, ['debit', 'withdrawal', 'moneyout']);
  const iCredit = findCol(headers, ['credit', 'deposit', 'moneyin']);
  if (iDate < 0 || (iAmount < 0 && iDebit < 0 && iCredit < 0)) {
    throw new Error('Could not find Date and Amount columns in this CSV.');
  }

  const toISO = (v) => {
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };
  const numOf = (v) => Math.abs(parseFloat(String(v).replace(/[^0-9.-]/g, ''))) || 0;

  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    const date = toISO(cols[iDate]);
    if (!date) continue;
    let amount = 0;
    let type = 'expense';
    if (iAmount >= 0) {
      const raw = parseFloat(String(cols[iAmount]).replace(/[^0-9.-]/g, '')) || 0;
      amount = Math.abs(raw);
      const t = iType >= 0 ? norm(cols[iType]) : '';
      if (t.includes('income') || t.includes('credit') || t.includes('deposit')) type = 'income';
      else if (t.includes('expense') || t.includes('debit')) type = 'expense';
      else type = raw >= 0 ? 'income' : 'expense';
    } else {
      const debit = iDebit >= 0 ? numOf(cols[iDebit]) : 0;
      const credit = iCredit >= 0 ? numOf(cols[iCredit]) : 0;
      if (credit > 0) { type = 'income'; amount = credit; }
      else { type = 'expense'; amount = debit; }
    }
    if (amount <= 0) continue;
    const category = iCat >= 0 ? cols[iCat] : '';
    const note = iNote >= 0 ? cols[iNote] : '';
    rows.push({ date, type, amount, category: category || (type === 'income' ? 'Income' : 'Uncategorized'), note });
  }
  if (rows.length === 0) throw new Error('No valid transactions found in the CSV.');
  return rows;
}

/** Open the file picker, read a transactions CSV and return parsed rows + a preview. */
export async function pickAndValidateCSV() {
  const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const text = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
  const rows = parseTransactionsCsv(text);
  const income = rows.filter((r) => r.type === 'income').length;
  return { rows, total: rows.length, income, expense: rows.length - income };
}

// Signature used to detect an already-imported transaction: same account, same
// day, same rounded amount, same type. Note is intentionally excluded
// (statements and the account's own ledger often word the same charge
// differently); account IS included so two genuinely distinct same-day,
// same-amount transactions on different accounts never dedupe each other.
const txnSig = (accountId, type, date, amount) => `${accountId || ''}|${type}|${date}|${Math.round(Number(amount || 0) * 100)}`;

/**
 * Insert parsed transactions into expenses/incomes for the user.
 *  - `accountId` attaches them to a real account so they move balances / net worth
 *    / safe-to-spend (without it, imported rows were invisible to balances).
 *  - Rows already present (same day+amount+type) are skipped so re-importing an
 *    overlapping statement doesn't double-count.
 *  - `toUsdFn(amount)` (optional) stamps each row's USD value at entry for
 *    historical-FX stability; returns null when the rate is unknown.
 */
export async function importCSVTransactions(userId, rows, accountId = null, toUsdFn = null) {
  // Build the existing-signature set across the import's date span for dedupe.
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  let existing = new Set();
  if (dates.length) {
    const [{ data: ex }, { data: inc }] = await Promise.all([
      supabase.from('expenses').select('amount, date, account_id').eq('user_id', userId).gte('date', dates[0]).lte('date', dates[dates.length - 1]),
      supabase.from('incomes').select('amount, date, account_id').eq('user_id', userId).gte('date', dates[0]).lte('date', dates[dates.length - 1]),
    ]);
    (ex || []).forEach((e) => existing.add(txnSig(e.account_id, 'expense', e.date, e.amount)));
    (inc || []).forEach((i) => existing.add(txnSig(i.account_id, 'income', i.date, i.amount)));
  }

  const fresh = [];
  let skipped = 0;
  for (const r of rows) {
    const sig = txnSig(accountId, r.type, r.date, r.amount);
    if (existing.has(sig)) { skipped += 1; continue; }
    existing.add(sig); // guard against duplicates within the same file
    fresh.push(r);
  }

  const stamp = (amt) => (toUsdFn ? { amount_usd: toUsdFn(amt) } : {});
  const expenses = fresh.filter((r) => r.type === 'expense').map((r) => ({ user_id: userId, amount: r.amount, category: r.category, note: r.note || null, date: r.date, account_id: accountId, ...stamp(r.amount) }));
  const incomes = fresh.filter((r) => r.type === 'income').map((r) => ({ user_id: userId, amount: r.amount, source: r.category, category: r.category, note: r.note || null, date: r.date, account_id: accountId, ...stamp(r.amount) }));
  if (expenses.length) { const { error } = await supabase.from('expenses').insert(expenses); if (error) throw error; }
  if (incomes.length) { const { error } = await supabase.from('incomes').insert(incomes); if (error) throw error; }
  return { expenses: expenses.length, incomes: incomes.length, skipped };
}

/**
 * Re-add the user's most recent transaction with today's date (quick-add via
 * FAB long-press). Returns a short label, or null if there's nothing to repeat.
 */
export async function duplicateLastTransaction(userId) {
  const today = toLocalISODate();
  const [expRes, incRes] = await Promise.all([
    supabase.from('expenses').select('amount, category, account_id, note, date, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
    supabase.from('incomes').select('amount, source, category, account_id, note, date, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ]);
  const exp = expRes.data?.[0];
  const inc = incRes.data?.[0];
  const expTime = exp ? new Date(exp.created_at).getTime() : -1;
  const incTime = inc ? new Date(inc.created_at).getTime() : -1;
  if (expTime < 0 && incTime < 0) return null;

  // Historical-FX stamp at today's rate (this is a NEW transaction dated today).
  const stampFor = async (amount, accountId) => {
    if (!accountId) return {};
    const [{ data: acct }, fx] = await Promise.all([
      supabase.from('accounts').select('currency').eq('id', accountId).maybeSingle(),
      fetchRates().catch(() => null),
    ]);
    if (!fx?.rates) return {};
    const helpers = { convert: (a, f, t) => convertFx(a, f, t, fx.rates), hasRate: (code) => !code || !!fx.rates[code] };
    const v = toUsd(amount, acct?.currency || 'USD', helpers);
    return v == null ? {} : { amount_usd: v };
  };

  if (expTime >= incTime) {
    const { error } = await supabase.from('expenses').insert({
      user_id: userId, amount: exp.amount, category: exp.category, account_id: exp.account_id || null, note: exp.note || null, date: today,
      ...(await stampFor(exp.amount, exp.account_id)),
    });
    if (error) throw error;
    return exp.note || exp.category || 'Expense';
  }
  const { error } = await supabase.from('incomes').insert({
    user_id: userId, amount: inc.amount, source: inc.source, category: inc.category, account_id: inc.account_id || null, note: inc.note || null, date: today,
    ...(await stampFor(inc.amount, inc.account_id)),
  });
  if (error) throw error;
  return inc.note || inc.source || 'Income';
}

const toISODate = (v) => {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};
const absNum = (v) => Math.abs(parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''))) || 0;

/** Auto-detect the column index for each transaction field from header names. */
export function autoMapColumns(headers) {
  return {
    date: findCol(headers, ['date', 'transactiondate', 'posteddate']),
    amount: findCol(headers, ['amount', 'value']),
    type: findCol(headers, ['type', 'transactiontype']),
    category: findCol(headers, ['category', 'source']),
    note: findCol(headers, ['note', 'description', 'memo', 'details', 'narration']),
    debit: findCol(headers, ['debit', 'withdrawal', 'moneyout']),
    credit: findCol(headers, ['credit', 'deposit', 'moneyin']),
  };
}

/**
 * Pick a statement file for the import wizard. Handles two shapes:
 *  - CSV / Excel  → { kind:'sheet', name, headers, rows, auto } (column-mapped)
 *  - PDF / image  → { kind:'pdf', name, base64, mimeType } (AI-extracted)
 */
export async function readTransactionFile() {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf', 'image/*', '*/*',
    ],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const name = asset.name || '';
  const mime = asset.mimeType || '';
  const isPdf = /\.pdf$/i.test(name) || mime.includes('pdf');
  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(name) || mime.startsWith('image/');

  // Statements arrive as PDFs (or a photo of one) far more often than as a clean
  // CSV — hand those to the AI extractor instead of the column mapper.
  if (isPdf || isImage) {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const mimeType = isPdf ? 'application/pdf' : (mime || 'image/jpeg');
    return { kind: 'pdf', name: name || (isPdf ? 'statement.pdf' : 'statement'), base64, mimeType };
  }

  const isExcel = /\.xlsx?$/i.test(name) || mime.includes('sheet') || mime.includes('ms-excel');
  let rows2d = [];
  if (isExcel) {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const wb = XLSX.read(b64, { type: 'base64' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  } else {
    const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    rows2d = text.split(/\r?\n/).filter((l) => l.trim().length).map(parseCsvLine);
  }
  rows2d = rows2d.filter((r) => Array.isArray(r) && r.some((cell) => String(cell ?? '').trim().length));
  if (rows2d.length < 2) throw new Error('The file has no data rows.');

  const headers = rows2d[0].map((h) => String(h ?? ''));
  const rows = rows2d.slice(1).map((r) => r.map((c) => String(c ?? '')));
  return { kind: 'sheet', name, headers, rows, auto: autoMapColumns(headers) };
}

/**
 * Send a statement (PDF or image, base64) to the parse-statement edge function.
 * Returns normalized, AI-categorized transactions ready for the import preview.
 */
export async function parseStatement({ fileBase64, mimeType = 'application/pdf', categories = [], currency = 'USD', country = null }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const { data, error } = await supabase.functions.invoke('parse-statement', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { fileBase64, mimeType, categories, currency, country },
  });
  if (error) {
    const msg = error.context ? await error.context.text?.().catch(() => null) : null;
    // The wizard is deployed ahead of the edge function; give a clear "not live yet" hint.
    throw new Error(msg || error.message || 'Statement import is being switched on — try again shortly.');
  }
  if (data?.error) throw new Error(data.error);
  // The edge function returns AI-shaped rows {date, description, amount, type,
  // categoryName}; normalize to the canonical {date, amount, type, category, note}
  // the import preview and importCSVTransactions expect — otherwise category and
  // description are silently dropped on import.
  const transactions = (Array.isArray(data?.transactions) ? data.transactions : []).map((t) => ({
    date: t.date,
    amount: Math.abs(Number(t.amount) || 0),
    type: t.type === 'income' ? 'income' : 'expense',
    category: t.category || t.categoryName || (t.type === 'income' ? 'Income' : 'Uncategorized'),
    note: t.note || t.description || '',
  })).filter((t) => t.date && t.amount > 0);
  return {
    transactions,
    // Metadata (absent from older deployments — default to "fine"):
    statementCurrency: data?.statementCurrency || null,
    complete: data?.complete !== false,
  };
}

/**
 * Best-effort AI categorization for imported rows that have no category yet
 * (mostly the CSV/Excel path — PDFs come pre-categorized). Bounded so a large
 * import can't fan out into hundreds of calls; failures leave the row as-is.
 */
export async function autoCategorizeRows(rows, categories, { currency = 'USD', country = null, userId = null, cap = 40, concurrency = 4 } = {}) {
  const cats = (categories || []).filter((c) => c?.id && c?.name);
  const isBlank = (c) => !c || /^(uncategorized|income|other)$/i.test(String(c).trim());
  const out = rows.map((r) => ({ ...r }));

  // 1. Apply learned merchant→category rules first — free, instant, offline.
  if (userId) {
    try {
      const rules = await loadRules(userId);
      out.forEach((r) => { if (r.type === 'expense' && isBlank(r.category) && (r.note || '').trim()) { const hit = applyRules(rules, r.note); if (hit) r.category = hit; } });
    } catch { /* best-effort */ }
  }
  if (!cats.length) return out;

  // 2. Fall back to the AI only for what's still uncategorized (bounded).
  const targets = [];
  out.forEach((r, i) => { if (r.type === 'expense' && isBlank(r.category) && (r.note || '').trim().length > 1) targets.push(i); });
  if (!targets.length || targets.length > cap) return out; // skip huge imports to bound cost

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return out;
  const nameById = {}; cats.forEach((c) => { nameById[c.id] = c.name; });

  // Names the user actually has, for validating whatever the AI hands back.
  const validNames = new Map(cats.map((c) => [String(c.name).trim().toLowerCase(), c.name]));

  let cursor = 0;
  let applied = 0;
  let failed = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const idx = targets[cursor++];
      try {
        const { data, error } = await supabase.functions.invoke('ai-categorize', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { description: out[idx].note, categories: cats, transactionType: 'expense' },
        });
        // A non-2xx leaves `data` null, and the function also returns
        // `{suggestions: []}` on its own soft failures — both used to look
        // identical to "no match" and vanished without trace.
        if (error || data?.error || !data?.suggestions?.length) { failed += 1; continue; }
        const top = data.suggestions[0];
        // Only accept a name the user actually has, so an invented category
        // can't silently create one that no budget will ever match.
        const name = validNames.get(String(top.categoryName ?? '').trim().toLowerCase())
          || nameById[top.categoryId];
        if (name && top.confidence >= 0.6) { out[idx].category = name; applied += 1; }
      } catch { failed += 1; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  // Attached (non-enumerable so it never leaks into a DB insert) so callers can
  // tell "nothing needed categorizing" apart from "categorization broke".
  Object.defineProperty(out, 'aiStats', { value: { attempted: targets.length, applied, failed }, enumerable: false });
  return out;
}

/** Apply a column mapping to raw rows → normalized transactions. */
export function rowsToTransactions(rows, mapping) {
  const out = [];
  for (const cols of rows) {
    const date = mapping.date >= 0 ? toISODate(cols[mapping.date]) : null;
    if (!date) continue;
    let amount = 0; let type = 'expense';
    if (mapping.amount >= 0 && String(cols[mapping.amount] ?? '').trim()) {
      const rawNum = parseFloat(String(cols[mapping.amount]).replace(/[^0-9.-]/g, '')) || 0;
      amount = Math.abs(rawNum);
      const t = mapping.type >= 0 ? norm(cols[mapping.type]) : '';
      if (t.includes('income') || t.includes('credit') || t.includes('deposit')) type = 'income';
      else if (t.includes('expense') || t.includes('debit')) type = 'expense';
      else type = rawNum >= 0 ? 'income' : 'expense';
    } else {
      const debit = mapping.debit >= 0 ? absNum(cols[mapping.debit]) : 0;
      const credit = mapping.credit >= 0 ? absNum(cols[mapping.credit]) : 0;
      if (credit > 0) { type = 'income'; amount = credit; } else { type = 'expense'; amount = debit; }
    }
    if (amount <= 0) continue;
    const category = mapping.category >= 0 ? cols[mapping.category] : '';
    const note = mapping.note >= 0 ? cols[mapping.note] : '';
    out.push({ date, type, amount, category: category || (type === 'income' ? 'Income' : 'Uncategorized'), note });
  }
  return out;
}

/** Send a receipt image to the parse-receipt edge function for OCR extraction. */
export async function parseReceipt({ imageBase64, mimeType = 'image/jpeg', categories = [], currency = 'USD', country = null }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const { data, error } = await supabase.functions.invoke('parse-receipt', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { imageBase64, mimeType, categories, currency, country },
  });
  if (error) {
    // Surface the function's JSON error message when present.
    const msg = error.context ? await error.context.text?.().catch(() => null) : null;
    throw new Error(msg || error.message || 'Could not read the receipt.');
  }
  if (data?.error) throw new Error(data.error);
  return data.receipt;
}

/** Upload a receipt image to the private receipts bucket; returns the storage path. */
export async function uploadReceipt(userId, asset) {
  const uri = asset.uri;
  const ext = (uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(base64);
  const { error } = await supabase.storage.from('receipts').upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

/** Upload a local image to the avatars bucket and return its public URL. */
export async function uploadAvatar(userId, asset) {
  const uri = asset.uri;
  const ext = (uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(base64);
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = data.publicUrl;
  const { error: upErr } = await supabase.from('profiles').upsert({ user_id: userId, avatar_url: url }, { onConflict: 'user_id' });
  if (upErr) throw upErr;
  return url;
}
