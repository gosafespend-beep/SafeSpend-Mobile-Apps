import React, { useState, useEffect } from 'react';
import { Alert, View, Text, Pressable, ScrollView } from 'react-native';
import { FormSheet, AmountField } from '../components/FormSheet';
import { Input } from '../components';
import { c, ff } from '../theme/tokens';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useAccounts } from '../hooks/useAccounts';
import { useFx } from '../contexts/FxContext';
import { toUsd } from '../lib/fx';
import { currencySymbol } from '../lib/format';
import { COLOR_SWATCHES } from './palette';
import { bumpRefresh } from '../contexts/RefreshContext';

export function AddDebtSheet({ open, onClose, onSaved, editing = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  // An existing debt keeps its own currency; a new one uses the display currency.
  const sym = currencySymbol(editing?.currency || settings.currency);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [apr, setApr] = useState('');
  const [min, setMin] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (open && editing) {
      setName(editing.name || '');
      setBalance(editing.current != null ? String(editing.current) : '');
      setApr(editing.apr != null ? String(editing.apr) : '');
      setMin(editing.min != null ? String(editing.min) : '');
    } else if (open && !editing) {
      setName(''); setBalance(''); setApr(''); setMin('');
    }
  }, [open, editing]);

  const save = async () => {
    const bal = parseFloat(String(balance).replace(/[^0-9.]/g, '')) || 0;
    if (!name.trim() || bal <= 0) { Alert.alert('Check details', 'Enter a name and current balance.'); return; }
    const fields = {
      name: name.trim(), current_balance: bal,
      interest_rate: parseFloat(String(apr).replace(/[^0-9.]/g, '')) || 0,
      minimum_payment: parseFloat(String(min).replace(/[^0-9.]/g, '')) || 0,
    };
    setSaving(true);
    const { error } = isEdit
      ? await supabase.from('debts').update(fields).eq('id', editing.id)
      // Stamp the entry currency (column is NOT NULL DEFAULT 'USD').
      : await supabase.from('debts').insert({ user_id: user.id, ...fields, currency: settings.currency, starting_balance: bal, color: COLOR_SWATCHES[6].value, is_active: true });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved(); onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title={isEdit ? 'Edit debt' : 'Add debt'} onSave={save} saving={saving} saveLabel={isEdit ? 'Save changes' : 'Add debt'} bottomInset={bottomInset}>
      <Input label="Debt name" placeholder="e.g. Visa Card" value={name} onChange={setName} />
      <AmountField label="Current balance" value={balance} onChange={setBalance} symbol={sym} />
      <Input label="Interest rate (APR %)" placeholder="19.99" value={apr} onChange={setApr} keyboardType="decimal-pad" />
      <AmountField label="Minimum payment" value={min} onChange={setMin} symbol={sym} />
    </FormSheet>
  );
}

export function PaymentSheet({ open, onClose, onSaved, debt, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data: acctData } = useAccounts();
  const { convert, hasRate } = useFx();
  const accounts = (acctData?.accounts || []).filter((a) => a.isActive && !a.credit);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [payFrom, setPayFrom] = useState(null); // optional account → also records an expense
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setPayFrom(null); }, [open]);

  const save = async () => {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) { Alert.alert('Enter an amount', 'Amount must be greater than 0.'); return; }
    if (!debt?.id) { Alert.alert('No debt selected'); return; }
    setSaving(true);
    const today = todayISO();
    const { error } = await supabase.from('debt_payments').insert({
      user_id: user.id, debt_id: debt.id, amount: amt, date: today, note: note || null,
    });
    if (error) { setSaving(false); Alert.alert('Could not save', error.message); return; }
    const { error: rpcErr } = await supabase.rpc('atomic_decrement_debt_balance', { p_debt_id: debt.id, p_amount: amt });
    // Optionally reflect the payment on a real account (like bill payments do) —
    // opt-in so users who already log these manually don't double-count.
    if (payFrom) {
      const acct = accounts.find((a) => a.id === payFrom);
      const acctCur = acct?.currency || settings.currency;
      const postAmount = Math.round(convert(amt, settings.currency, acctCur) * 100) / 100;
      await supabase.from('expenses').insert({
        user_id: user.id, amount: postAmount, category: 'Debt payment', account_id: payFrom,
        note: `Debt: ${debt.name}`, date: today, amount_usd: toUsd(postAmount, acctCur, { convert, hasRate }),
      }).then(({ error: e }) => { if (e) Alert.alert('Payment saved, but the account expense failed', e.message); });
    }
    setSaving(false);
    if (rpcErr) { Alert.alert('Payment saved, but balance not updated', rpcErr.message); }
    setAmount(''); setNote(''); bumpRefresh(); onSaved && onSaved(); onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title={debt ? `Pay ${debt.name}` : 'Make payment'} onSave={save} saving={saving} saveLabel="Record payment" bottomInset={bottomInset}>
      <AmountField label="Payment amount" value={amount} onChange={setAmount} symbol={currencySymbol(settings.currency)} />
      {accounts.length > 0 ? (
        <View>
          <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>Paid from account (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Pressable onPress={() => setPayFrom(null)} accessibilityRole="button" accessibilityState={{ selected: payFrom == null }} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: payFrom == null ? c('primary', 0.12) : c('surfaceSecondary'), borderWidth: 1, borderColor: payFrom == null ? c('primary') : 'transparent' }}>
              <Text style={{ fontSize: 13, fontFamily: ff.med, color: payFrom == null ? c('fg') : c('fgMuted') }}>Don't record</Text>
            </Pressable>
            {accounts.map((a) => {
              const active = payFrom === a.id;
              return (
                <Pressable key={a.id} onPress={() => setPayFrom(a.id)} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? c('primary', 0.12) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? c('primary') : 'transparent' }}>
                  <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{a.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={{ fontSize: 10.5, color: c('fgMuted'), marginTop: 6 }}>Pick an account to also record this as an expense (so your balance moves). Leave it off if you log the payment separately.</Text>
        </View>
      ) : null}
      <Input label="Note (optional)" placeholder="e.g. Extra payment" value={note} onChange={setNote} />
    </FormSheet>
  );
}
