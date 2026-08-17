import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { c, ff, R } from '../theme/tokens';
import { FormSheet, AmountField, SegmentField, DateField } from '../components/FormSheet';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRegion } from '../contexts/RegionContext';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { useToast } from '../contexts/ToastContext';
import { currencySymbol } from '../lib/format';
import { useFx } from '../contexts/FxContext';
import { toUsd } from '../lib/fx';
import { enqueueInsert, isNetworkError } from '../lib/writeQueue';
import { todayISO } from '../lib/date';
import { parseTransactionSms } from '../lib/smsParser';
import { bumpRefresh } from '../contexts/RefreshContext';

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9999, borderWidth: 1, borderColor: active ? c('primary') : c('border'), backgroundColor: active ? c('primary', 0.1) : c('surface') }}>
    <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('primary') : c('fg') }}>{label}</Text>
  </Pressable>
);

/**
 * Paste (or share) a bank / mobile-money transaction message → parse it → review
 * and save. A Play-compliant way to auto-capture from SMS: the user explicitly
 * brings each message in, so no SMS permission is needed. Built on FormSheet, so
 * it inherits the read-only (subscription) gate.
 */
export default function ImportMessageSheet({ open, onClose, onSaved, bottomInset = 0, initialText = '' }) {
  const { user } = useAuth();
  const { convert, hasRate } = useFx();
  const { settings } = useSettings();
  const { region } = useRegion();
  const { show } = useToast();
  const { data: acctData } = useAccounts();
  const { data: catData } = useCategories();
  const accounts = acctData?.accounts || [];

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(false);
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const parseFrom = (raw) => {
    const d = parseTransactionSms(raw, { defaultCurrency: region?.currency || settings.currency });
    if (!d) return false;
    setType(d.type);
    setAmount(String(d.amount));
    setNote(d.note || '');
    setParsed(true);
    const match = accounts.find((a) => a.currency === d.currency);
    if (match) setAccountId(match.id);
    return true;
  };

  // On open, reset — and if a shared message came in (Messages → Share → SafeSpend),
  // prefill and parse it immediately.
  useEffect(() => {
    if (!open) return;
    const init = initialText || '';
    setText(init); setParsed(false); setType('expense'); setAmount(''); setNote(''); setCategory(''); setDate(todayISO());
    if (init) parseFrom(init);
  }, [open, initialText]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId == null && accounts.length) setAccountId(accounts[0].id); }, [accounts, accountId]);

  const cats = useMemo(() => {
    const real = type === 'expense' ? catData?.expense : catData?.income;
    return (real && real.length ? real : []).slice(0, 8);
  }, [type, catData]);

  const acctCurrency = accounts.find((a) => a.id === accountId)?.currency || settings.currency;
  const sym = currencySymbol(acctCurrency);

  const doParse = () => {
    if (!parseFrom(text)) Alert.alert("Couldn't read that", 'Paste a bank or mobile-money transaction message — for example an M-Pesa confirmation or a bank debit/credit alert.');
  };

  const save = async () => {
    const value = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (!value || value <= 0) { Alert.alert('Enter an amount', 'Please enter a valid amount greater than 0.'); return; }
    if (!user) return;
    setSaving(true);
    try {
      const table = type === 'expense' ? 'expenses' : 'incomes';
      const usd = toUsd(value, acctCurrency, { convert, hasRate });
      const row = type === 'expense'
        ? { user_id: user.id, amount: value, category: category || 'Uncategorized', account_id: accountId, note: note || null, date, amount_usd: usd }
        : { user_id: user.id, amount: value, source: category || 'Income', category: category || 'Income', account_id: accountId, note: note || null, date, amount_usd: usd };
      const { error } = await supabase.from(table).insert([row]);
      if (error) {
        if (isNetworkError(error)) { await enqueueInsert(user.id, table, [row]); show("Saved offline — we'll sync it when you're back online", { icon: 'wallet' }); }
        else throw error;
      } else {
        bumpRefresh(); onSaved && onSaved();
      }
      onClose && onClose();
    } catch (e) {
      Alert.alert('Could not save', e.message);
    }
    setSaving(false);
  };

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Import from message"
      onSave={parsed ? save : doParse}
      saving={saving}
      saveLabel={parsed ? 'Save transaction' : 'Read message'}
      bottomInset={bottomInset}
      feature="import_message"
    >
      <Text style={{ fontSize: 12, color: c('fgMuted'), lineHeight: 17 }}>Paste a bank or mobile-money transaction message (e.g. an M-Pesa confirmation or a bank alert). We’ll pull out the amount and details — just review and save.</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Paste your transaction message here…"
        placeholderTextColor={c('fgMuted')}
        style={{ minHeight: 88, backgroundColor: c('input'), borderWidth: 1, borderColor: c('border'), borderRadius: R.input, padding: 12, color: c('fg'), fontSize: 14, textAlignVertical: 'top' }}
      />
      {parsed ? (
        <>
          <SegmentField value={type} onChange={setType} options={[{ label: 'Expense', value: 'expense' }, { label: 'Income', value: 'income' }]} />
          <AmountField value={amount} onChange={setAmount} symbol={sym} />
          <View>
            <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {cats.map((ct) => <Chip key={ct.name} label={ct.name} active={category === ct.name} onPress={() => setCategory(ct.name)} />)}
            </View>
          </View>
          {accounts.length > 1 ? (
            <View>
              <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>Account</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {accounts.map((a) => <Chip key={a.id} label={a.name} active={accountId === a.id} onPress={() => setAccountId(a.id)} />)}
              </View>
            </View>
          ) : null}
          <DateField value={date} onChange={setDate} />
        </>
      ) : null}
    </FormSheet>
  );
}
