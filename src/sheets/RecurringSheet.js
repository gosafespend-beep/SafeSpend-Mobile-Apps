import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { FormSheet, AmountField, SegmentField, DateField } from '../components/FormSheet';
import { Input } from '../components';
import { c, ff } from '../theme/tokens';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useAccounts } from '../hooks/useAccounts';
import { currencySymbol } from '../lib/format';
import { bumpRefresh } from '../contexts/RefreshContext';

const FREQS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: '2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function RecurringSheet({ open, onClose, onSaved, editing = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data: acctData } = useAccounts();
  const accounts = acctData?.accounts || [];
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [accountId, setAccountId] = useState(null);
  const [startDate, setStartDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (open && editing) {
      setType(editing.type || 'expense');
      setAmount(String(editing.amount ?? ''));
      setCategory(editing.description || editing.category || '');
      setFrequency(editing.frequency || 'monthly');
      setAccountId(editing.accountId || null);
      setStartDate(editing.nextDue || todayISO());
    } else if (open) {
      setType('expense'); setAmount(''); setCategory(''); setFrequency('monthly');
      setAccountId(accounts[0]?.id || null); setStartDate(todayISO());
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0 || !category.trim()) { Alert.alert('Check details', 'Enter an amount and a description.'); return; }
    setSaving(true);
    const fields = {
      type, amount: amt, category: category.trim(), description: category.trim(),
      frequency, account_id: accountId, is_active: true,
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from('recurring_transactions').update({ ...fields, next_due: startDate }).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('recurring_transactions').insert({ user_id: user.id, ...fields, next_due: startDate }));
    }
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title={isEdit ? 'Edit recurring' : 'New recurring'} onSave={save} saving={saving} saveLabel={isEdit ? 'Save changes' : 'Create'} bottomInset={bottomInset}>
      <SegmentField label="Type" options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} value={type} onChange={setType} />
      <AmountField label="Amount" value={amount} onChange={setAmount} symbol={currencySymbol(accounts.find((a) => a.id === accountId)?.currency || settings.currency)} />
      <Input label="Description" placeholder="e.g. Rent, Salary, Netflix" value={category} onChange={setCategory} />
      <SegmentField label="Frequency" options={FREQS} value={frequency} onChange={setFrequency} />
      {accounts.length > 0 ? (
        <View>
          <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>Account</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {accounts.map((a) => {
              const active = accountId === a.id;
              return (
                <Pressable key={a.id} onPress={() => setAccountId(a.id)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? c('primary', 0.12) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? c('primary') : 'transparent' }}>
                  <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{a.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <DateField label={isEdit ? 'Next due' : 'Starts on'} value={startDate} onChange={setStartDate} />
    </FormSheet>
  );
}
