import React, { useState, useEffect, useMemo } from 'react';
import { Alert, View, Text, Pressable, ScrollView } from 'react-native';
import { FormSheet, AmountField, SegmentField, SwatchPicker } from '../components/FormSheet';
import { Input } from '../components';
import { c, ff } from '../theme/tokens';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { currencySymbol, SUPPORTED_CURRENCIES } from '../lib/format';
import { COLOR_SWATCHES, ACCOUNT_TYPES } from './palette';
import { bumpRefresh } from '../contexts/RefreshContext';

export default function AccountSheet({ open, onClose, onSaved, editing = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [balance, setBalance] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[2].value);
  const [currency, setCurrency] = useState(settings.currency);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  // Display currency first, then the rest — most users keep the default.
  const currencyOptions = useMemo(() => {
    const rest = SUPPORTED_CURRENCIES.filter((x) => x.code !== settings.currency);
    const head = SUPPORTED_CURRENCIES.find((x) => x.code === settings.currency);
    return head ? [head, ...rest] : SUPPORTED_CURRENCIES;
  }, [settings.currency]);

  useEffect(() => {
    if (open && editing) {
      setName(editing.name || '');
      setType(String(editing.type || 'bank').toLowerCase());
      setBalance(editing.initialBalance != null ? String(editing.initialBalance) : '');
      setColor(editing.color || COLOR_SWATCHES[2].value);
      setCurrency(editing.currency || settings.currency);
    } else if (open && !editing) {
      setName(''); setType('bank'); setBalance(''); setColor(COLOR_SWATCHES[2].value);
      setCurrency(settings.currency);
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Give the account a name.'); return; }
    // Changing an existing account's currency re-denominates its amounts (they
    // are NOT converted) — make sure that's intended.
    if (isEdit && editing.currency && editing.currency !== currency) {
      Alert.alert(
        'Change account currency?',
        `Amounts on this account will be treated as ${currency} instead of ${editing.currency}. Existing amounts are not converted.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Change', style: 'destructive', onPress: commit }]
      );
      return;
    }
    commit();
  };

  const commit = async () => {
    setSaving(true);
    const fields = {
      name: name.trim(), type,
      initial_balance: parseFloat(String(balance).replace(/[^0-9.-]/g, '')) || 0,
      color, currency,
    };
    const { error } = isEdit
      ? await supabase.from('accounts').update(fields).eq('id', editing.id)
      : await supabase.from('accounts').insert({ user_id: user.id, ...fields, is_active: true });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title={isEdit ? 'Edit account' : 'Add account'} onSave={save} saving={saving} saveLabel={isEdit ? 'Save changes' : 'Add account'} bottomInset={bottomInset}>
      <Input label="Account name" placeholder="e.g. Chase Checking" value={name} onChange={setName} />
      <SegmentField label="Type" options={ACCOUNT_TYPES} value={type} onChange={setType} />
      <View>
        <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>Currency</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {currencyOptions.map((cur) => {
            const active = currency === cur.code;
            return (
              <Pressable
                key={cur.code}
                onPress={() => setCurrency(cur.code)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${cur.name}`}
                style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? c('primary', 0.12) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? c('primary') : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{`${cur.symbol} ${cur.code}`}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <AmountField
        label={type === 'credit' ? 'Amount owed' : (isEdit ? 'Starting balance' : 'Current balance')}
        value={balance}
        onChange={setBalance}
        symbol={currencySymbol(currency)}
      />
      {type === 'credit' ? (
        <Text style={{ fontSize: 11, color: c('fgMuted'), lineHeight: 16, marginTop: -6 }}>
          Enter what you currently owe. Purchases increase it; payments reduce it.
        </Text>
      ) : null}
      {type === 'savings' ? (
        <Text style={{ fontSize: 11, color: c('fgMuted'), lineHeight: 16, marginTop: -6 }}>
          Counts toward your net worth but not Safe to Spend — money set aside stays set aside.
        </Text>
      ) : null}
      <SwatchPicker options={COLOR_SWATCHES} value={color} onChange={setColor} />
    </FormSheet>
  );
}
