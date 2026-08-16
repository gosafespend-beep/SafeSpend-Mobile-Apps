import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { FormSheet, AmountField, SegmentField } from '../components/FormSheet';
import { Input } from '../components';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { currencySymbol } from '../lib/format';
import { bumpRefresh } from '../contexts/RefreshContext';

export default function BillSheet({ open, onClose, onSaved, editing = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [need, setNeed] = useState('need');
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (open && editing) {
      setName(editing.name || '');
      setAmount(editing.amount != null ? String(editing.amount) : '');
      setDueDay(editing.day != null ? String(editing.day) : '');
      setNeed(editing.isNeed === false ? 'want' : 'need');
    } else if (open && !editing) {
      setName(''); setAmount(''); setDueDay(''); setNeed('need');
    }
  }, [open, editing]);

  const save = async () => {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    const day = parseInt(String(dueDay).replace(/[^0-9]/g, ''), 10);
    if (!name.trim() || amt <= 0) { Alert.alert('Check details', 'Enter a name and amount.'); return; }
    if (!day || day < 1 || day > 31) { Alert.alert('Due day', 'Enter a day of the month between 1 and 31.'); return; }
    setSaving(true);
    // Each row carries its own currency. On create stamp the currency the user
    // is actually typing in; on edit leave the stored one alone so the amount
    // isn't silently re-denominated.
    const rowCur = editing?.currency || settings.currency;
    const fields = { name: name.trim(), amount: amt, due_day: day, is_need: need === 'need' };
    const { error } = isEdit
      ? await supabase.from('bills').update(fields).eq('id', editing.id)
      : await supabase.from('bills').insert({ user_id: user.id, ...fields, currency: rowCur, frequency: 'monthly', is_active: true });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved(); onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title={isEdit ? 'Edit bill' : 'Add bill'} onSave={save} saving={saving} saveLabel={isEdit ? 'Save changes' : 'Add bill'} bottomInset={bottomInset}>
      <Input label="Bill name" placeholder="e.g. Rent" value={name} onChange={setName} />
      <AmountField label="Amount" value={amount} onChange={setAmount} symbol={currencySymbol(editing?.currency || settings.currency)} />
      <Input label="Due day of month (1–31)" placeholder="1" value={dueDay} onChange={setDueDay} keyboardType="number-pad" />
      <SegmentField label="Need or want" options={[{ value: 'need', label: 'Need' }, { value: 'want', label: 'Want' }]} value={need} onChange={setNeed} />
    </FormSheet>
  );
}
