import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { FormSheet } from '../components/FormSheet';
import { c, ff, num } from '../theme/tokens';
import { Icon } from '../components';
import { money } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useAccounts } from '../hooks/useAccounts';
import { readTransactionFile, rowsToTransactions, importCSVTransactions, parseStatement, autoCategorizeRows } from '../lib/dataManagement';
import { useFx } from '../contexts/FxContext';
import { toUsd } from '../lib/fx';
import { currencySymbol } from '../lib/format';
import { track } from '../lib/analytics';

const FIELDS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount' },
  { key: 'type', label: 'Type' },
  { key: 'category', label: 'Category' },
  { key: 'note', label: 'Description' },
  { key: 'debit', label: 'Debit / out' },
  { key: 'credit', label: 'Credit / in' },
];

export default function ImportWizard({ open, onClose, onDone, categories = [], currency, country = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const { bump } = useRefresh();
  const { settings } = useSettings();
  const { data: acctData } = useAccounts();
  const { convert, hasRate } = useFx();
  const accounts = acctData?.accounts?.filter((a) => a.isActive) || [];
  const cur = currency || settings.currency;
  const [step, setStep] = useState('upload'); // upload | mapping | extracting | preview | importing
  const [file, setFile] = useState(null); // { kind:'sheet', headers, rows, auto } | { kind:'pdf', base64, mimeType }
  const [mapping, setMapping] = useState(null);
  const [items, setItems] = useState([]); // normalized transactions ready to import
  const [accountId, setAccountId] = useState(null);
  const [busy, setBusy] = useState(false);

  // Default the reconcile-to account to the first one (once accounts load).
  React.useEffect(() => { if (accountId == null && accounts.length) setAccountId(accounts[0].id); }, [accounts, accountId]);

  // Imported amounts are stored in the TARGET ACCOUNT's currency, not the display
  // currency — so the preview must be denominated that way too. Previewing a KES
  // statement bound for a KES account as "-$2,340" was actively misleading: right
  // number, wrong unit, on the one screen whose whole job is letting the user
  // check the figures before they're written.
  const targetCur = accounts.find((a) => a.id === accountId)?.currency || cur;
  const m0 = (n) => money(n, { currency: targetCur, cents: false });

  const reset = () => { setStep('upload'); setFile(null); setMapping(null); setItems([]); setBusy(false); };
  const close = () => { reset(); onClose && onClose(); };

  const pick = async () => {
    setBusy(true);
    try {
      const res = await readTransactionFile();
      if (!res) { setBusy(false); return; }
      if (res.kind === 'pdf') {
        setFile(res);
        setStep('extracting');
        setBusy(false);
        try {
          track('statement_import_extract');
          const { transactions: txns, statementCurrency, complete } = await parseStatement({
            fileBase64: res.base64, mimeType: res.mimeType,
            categories: categories.map((x) => ({ name: x.name })), currency: cur, country,
          });
          if (!txns.length) {
            Alert.alert('No transactions found', "We couldn't read any transactions from this file. If it's password-protected, unlock it first, then try again.");
            reset();
          } else {
            // Honesty guards: warn when the statement's currency doesn't match the
            // display currency, or when extraction may have stopped early.
            const warnings = [];
            if (statementCurrency && statementCurrency !== cur) warnings.push(`This statement looks like it's in ${statementCurrency}, but amounts will be recorded on the account you pick — double-check the account's currency matches.`);
            if (!complete) warnings.push('This statement may be longer than we could read — check the totals and re-import missing pages separately.');
            if (warnings.length) Alert.alert('Check before importing', warnings.join('\n\n'));
            setItems(txns);
            setStep('preview');
          }
        } catch (e) {
          Alert.alert('Could not read statement', e.message);
          reset();
        }
      } else {
        setFile(res);
        setMapping(res.auto);
        setStep('mapping');
        setBusy(false);
      }
    } catch (e) {
      Alert.alert('Could not read file', e.message);
      setBusy(false);
    }
  };

  // Sheet path: apply the column mapping, then best-effort AI-categorize blanks.
  const goPreview = async () => {
    const rows = rowsToTransactions(file.rows, mapping);
    if (mapping.date < 0) { Alert.alert('Pick the Date column', 'Choose which column holds the transaction date.'); return; }
    if (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0) { Alert.alert('Pick an Amount column', 'Choose an Amount, or Debit and Credit columns.'); return; }
    if (rows.length === 0) { Alert.alert('No transactions found', 'Check your column choices — no valid rows were detected.'); return; }
    setBusy(true);
    let final = rows;
    let aiStats = null;
    try {
      final = await autoCategorizeRows(rows, categories, { currency: cur, country, userId: user?.id });
      aiStats = final.aiStats || null;
    } catch { /* best-effort */ }
    setItems(final);
    setStep('preview');
    setBusy(false);
    // Auto-categorization failing used to be invisible: every row simply arrived
    // "Uncategorized" with no explanation, and the user only noticed later when
    // their reports were dominated by it. Say so, once, and only when it's the
    // AI that broke rather than there being nothing to categorize.
    if (aiStats && aiStats.attempted > 0 && aiStats.applied === 0) {
      Alert.alert(
        'Categories need a hand',
        "We couldn't auto-categorize these rows, so they'll import as Uncategorized. You can set categories now in the preview, or edit them later.",
      );
    }
  };

  const previewTotal = items.reduce((s, r) => s + (r.type === 'expense' ? -r.amount : r.amount), 0);

  const runImport = async () => {
    setStep('importing'); setBusy(true);
    try {
      // Stamp each row's USD value at entry (historical-FX) in the target
      // account's currency; null when the rate is unknown.
      const toUsdFn = (amt) => toUsd(amt, targetCur, { convert, hasRate });
      const { expenses, incomes, skipped } = await importCSVTransactions(user.id, items, accountId, toUsdFn);
      track('statement_import_done', { count: expenses + incomes, skipped, source: file?.kind });
      bump();
      const added = expenses + incomes;
      Alert.alert('Imported', skipped > 0
        ? `Added ${added} transaction${added === 1 ? '' : 's'}. Skipped ${skipped} already in your records.`
        : `Added ${added} transaction${added === 1 ? '' : 's'}.`);
      onDone && onDone();
      close();
    } catch (e) { Alert.alert('Import failed', e.message); setStep('preview'); setBusy(false); }
  };

  const title = step === 'mapping' ? 'Match columns'
    : step === 'extracting' ? 'Reading statement'
    : step === 'preview' ? 'Review import' : 'Import transactions';
  const onSave = step === 'upload' ? pick
    : step === 'mapping' ? goPreview
    : step === 'preview' ? runImport : undefined;
  const saveLabel = step === 'upload' ? 'Choose a file'
    : step === 'mapping' ? 'Preview'
    : step === 'preview' ? `Import ${items.length}`
    : step === 'extracting' ? 'Reading…' : 'Importing…';

  return (
    <FormSheet open={open} onClose={close} title={title} onSave={onSave} saving={busy} saveLabel={saveLabel} bottomInset={bottomInset}>
      {step === 'upload' ? (
        <View style={{ gap: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 14, color: c('fg'), lineHeight: 20 }}>Import many transactions at once from a bank statement or spreadsheet.</Text>
          <View style={{ gap: 8 }}>
            {[
              { icon: 'receipt', title: 'PDF statement', body: 'Snap or upload your bank/card statement — AI reads and categorizes every line.' },
              { icon: 'barChart', title: 'CSV or Excel export', body: "Match the columns and preview before anything's added." },
            ].map((r) => (
              <View key={r.title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: c('surfaceSecondary') }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c('primary', 0.14), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={r.icon} size={17} color={c('primary')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>{r.title}</Text>
                  <Text style={{ fontSize: 11.5, color: c('fgMuted'), lineHeight: 17, marginTop: 1 }}>{r.body}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: c('fgMuted'), lineHeight: 17 }}>Supports PDF, image, .csv and .xlsx. You'll always review everything before it's saved. Password-protected PDFs need to be unlocked first.</Text>
        </View>
      ) : null}

      {step === 'extracting' ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 34 }}>
          <ActivityIndicator size="large" color={c('primary')} />
          <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>Reading your statement…</Text>
          <Text style={{ fontSize: 12, color: c('fgMuted'), textAlign: 'center', maxWidth: 260, lineHeight: 18 }}>
            Extracting and categorizing every transaction. This can take a moment for long statements.
          </Text>
        </View>
      ) : null}

      {step === 'mapping' && file?.kind === 'sheet' ? (
        <View style={{ gap: 14 }}>
          <Text style={{ fontSize: 12, color: c('fgMuted') }}>{`${file.name} · ${file.rows.length} rows`}</Text>
          {FIELDS.map((f) => (
            <View key={f.key}>
              <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.5, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>
                {f.label}{f.required ? ' *' : ''}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Chip label="—" active={mapping[f.key] < 0} onPress={() => setMapping({ ...mapping, [f.key]: -1 })} />
                {file.headers.map((h, i) => (
                  <Chip key={i} label={h || `Col ${i + 1}`} active={mapping[f.key] === i} onPress={() => setMapping({ ...mapping, [f.key]: i })} />
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      ) : null}

      {step === 'preview' || step === 'importing' ? (
        <View style={{ gap: 10 }}>
          {/* Reconcile-to account — so imported rows move balances & net worth. */}
          {accounts.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.5, textTransform: 'uppercase', color: c('fgMuted') }}>Add to account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {accounts.map((a) => (
                  <Chip
                    key={a.id}
                    label={`${a.name}${a.currency && a.currency !== cur ? ` · ${currencySymbol(a.currency)}` : ''}`}
                    active={accountId === a.id}
                    onPress={() => setAccountId(a.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c('fgMuted') }}>{`${items.length} transactions`}</Text>
            <Text style={[num(700), { fontSize: 13, color: previewTotal >= 0 ? c('income') : c('expense') }]}>{`${previewTotal >= 0 ? '+' : '-'}${m0(Math.abs(previewTotal))}`}</Text>
          </View>
          <View style={{ borderRadius: 12, backgroundColor: c('surfaceSecondary'), overflow: 'hidden' }}>
            {items.slice(0, 8).map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c('border', 0.4) }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: c('fg') }} numberOfLines={1}>{r.note || r.category}</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted') }}>{`${r.date} · ${r.category}`}</Text>
                </View>
                <Text style={[num(600), { fontSize: 13, color: r.type === 'income' ? c('income') : c('expense') }]}>{`${r.type === 'income' ? '+' : '-'}${m0(r.amount)}`}</Text>
              </View>
            ))}
          </View>
          {items.length > 8 ? <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center' }}>{`+ ${items.length - 8} more`}</Text> : null}
          {file?.kind === 'pdf' ? <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', lineHeight: 16 }}>AI-read from your statement — double-check amounts before importing.</Text> : null}
          {step === 'importing' ? <View style={{ padding: 10, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View> : null}
        </View>
      ) : null}
    </FormSheet>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} accessibilityLabel={label} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9999, backgroundColor: active ? c('primary') : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? 'transparent' : c('border') }}>
      <Text style={{ fontSize: 12, fontFamily: ff.med, color: active ? '#fff' : c('fg') }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
