import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { FormSheet, AmountField, SegmentField } from '../components/FormSheet';
import { Input } from '../components';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { currencySymbol } from '../lib/format';
import { ASSET_CATEGORIES, LIABILITY_CATEGORIES } from '../hooks/useNetWorth';
import { bumpRefresh } from '../contexts/RefreshContext';

/** Add/edit an asset or a liability. `kind` = 'asset' | 'liability'. */
export default function NetWorthSheet({ open, onClose, onSaved, kind = 'asset', editing = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const isAsset = kind === 'asset';
  const table = isAsset ? 'assets' : 'liabilities';
  const categories = isAsset ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState(categories[0].value);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (open && editing) {
      setName(editing.name || '');
      setValue(String(editing.value ?? ''));
      setCategory(editing.category || categories[0].value);
    } else if (open) {
      setName(''); setValue(''); setCategory(categories[0].value);
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const val = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
    if (!name.trim() || val <= 0) { Alert.alert('Check details', 'Enter a name and value.'); return; }
    setSaving(true);
    // Row-level currency: stamp on create, preserve on edit (see BillSheet).
    const rowCur = editing?.currency || settings.currency;
    const fields = { name: name.trim(), category, value: val };
    const { error } = isEdit
      ? await supabase.from(table).update(fields).eq('id', editing.id)
      : await supabase.from(table).insert({ user_id: user.id, ...fields, currency: rowCur });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  const title = `${isEdit ? 'Edit' : 'Add'} ${isAsset ? 'asset' : 'liability'}`;
  return (
    <FormSheet open={open} onClose={onClose} title={title} onSave={save} saving={saving} saveLabel={isEdit ? 'Save' : 'Add'} saveVariant={isAsset ? 'primary' : 'destructive'} bottomInset={bottomInset}>
      <Input label="Name" placeholder={isAsset ? 'e.g. Apartment, Car, Stocks' : 'e.g. Mortgage, Car loan'} value={name} onChange={setName} />
      <AmountField label="Value" value={value} onChange={setValue} symbol={currencySymbol(editing?.currency || settings.currency)} />
      <SegmentField label="Category" options={categories} value={category} onChange={setCategory} />
    </FormSheet>
  );
}
