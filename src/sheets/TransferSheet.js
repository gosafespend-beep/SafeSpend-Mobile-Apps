import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { FormSheet, AmountField, DateField } from '../components/FormSheet';
import { Input, Icon } from '../components';
import { c, ff } from '../theme/tokens';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { currencySymbol, money } from '../lib/format';
import { bumpRefresh } from '../contexts/RefreshContext';

function AccountRow({ label, accounts, value, onChange, exclude, displayCurrency }) {
  return (
    <View>
      <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {accounts.filter((a) => a.id !== exclude).map((a) => {
          const active = value === a.id;
          const foreign = a.currency && a.currency !== displayCurrency;
          return (
            <Pressable key={a.id} onPress={() => onChange(a.id)} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? c('primary', 0.12) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? c('primary') : 'transparent' }}>
              <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{foreign ? `${a.name} · ${a.currency}` : a.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const round2 = (x) => Math.round(x * 100) / 100;

export default function TransferSheet({ open, onClose, onSaved, accounts = [], bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [amount, setAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [toTouched, setToTouched] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const fromAcc = accounts.find((a) => a.id === from);
  const toAcc = accounts.find((a) => a.id === to);
  const fromCur = fromAcc?.currency || settings.currency;
  const toCur = toAcc?.currency || settings.currency;
  const crossCurrency = fromCur !== toCur;

  useEffect(() => {
    if (open) {
      setFrom(accounts[0]?.id || null);
      setTo(accounts[1]?.id || null);
      setAmount(''); setToAmount(''); setToTouched(false); setNote('');
      setDate(todayISO());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill the received amount from the FX rate until the user edits it.
  useEffect(() => {
    if (!crossCurrency || toTouched) return;
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    setToAmount(amt ? String(round2(convert(amt, fromCur, toCur))) : '');
  }, [amount, fromCur, toCur, crossCurrency, toTouched, convert]);

  const save = async () => {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) { Alert.alert('Enter an amount', 'Amount must be greater than 0.'); return; }
    if (!from || !to) { Alert.alert('Pick accounts', 'Choose both a source and destination account.'); return; }
    if (from === to) { Alert.alert('Different accounts', 'Source and destination must differ.'); return; }

    let toAmt = null;
    if (crossCurrency) {
      toAmt = parseFloat(String(toAmount).replace(/[^0-9.]/g, '')) || round2(convert(amt, fromCur, toCur));
      if (toAmt <= 0) { Alert.alert('Received amount', 'Enter how much lands in the destination account.'); return; }
    }

    setSaving(true);
    const { error } = await supabase.from('transfers').insert({
      user_id: user.id, from_account_id: from, to_account_id: to, amount: amt,
      to_amount: toAmt, date, note: note || null,
    });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title="Transfer" onSave={save} saving={saving} saveLabel="Transfer" bottomInset={bottomInset}>
      <AccountRow label="From" accounts={accounts} value={from} onChange={setFrom} exclude={to} displayCurrency={settings.currency} />
      <View style={{ alignItems: 'center' }}><Icon name="arrowUpDown" size={18} color={c('fgMuted')} /></View>
      <AccountRow label="To" accounts={accounts} value={to} onChange={setTo} exclude={from} displayCurrency={settings.currency} />
      <AmountField label={crossCurrency ? `Amount sent (${fromCur})` : 'Amount'} value={amount} onChange={setAmount} symbol={currencySymbol(fromCur)} />
      {crossCurrency ? (
        <View style={{ gap: 6 }}>
          <AmountField label={`Amount received (${toCur})`} value={toAmount} onChange={(v) => { setToTouched(true); setToAmount(v); }} symbol={currencySymbol(toCur)} />
          <Text style={{ fontSize: 11, color: c('fgMuted') }}>
            {/* A sub-1 rate rounds to "$0.01" at cent precision — ~30% off if read
                literally. Quote whichever direction actually carries precision. */}
            {convert(1, fromCur, toCur) >= 1
              ? `Auto-filled at today's rate (${money(1, { currency: fromCur, cents: false })} ≈ ${money(convert(1, fromCur, toCur), { currency: toCur })}). Edit if your bank used a different rate.`
              : `Auto-filled at today's rate (${money(1, { currency: toCur, cents: false })} ≈ ${money(convert(1, toCur, fromCur), { currency: fromCur })}). Edit if your bank used a different rate.`}
          </Text>
        </View>
      ) : null}
      <DateField label="Date" value={date} onChange={setDate} />
      <Input label="Note (optional)" placeholder="e.g. Move to savings" value={note} onChange={setNote} />
    </FormSheet>
  );
}
