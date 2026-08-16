import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { FormSheet, SegmentField, SwatchPicker } from '../components/FormSheet';
import { Input } from '../components';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { COLOR_SWATCHES, EXPENSE_ICONS } from './palette';
import { bumpRefresh } from '../contexts/RefreshContext';

export default function CategorySheet({ open, onClose, onSaved, kind = 'expense', editing = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0].value);
  const [icon, setIcon] = useState(EXPENSE_ICONS[0]);
  const [need, setNeed] = useState('want');
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;
  const table = kind === 'income' ? 'income_categories' : 'categories';

  useEffect(() => {
    if (open && editing) {
      setName(editing.name || '');
      setColor(editing.color || COLOR_SWATCHES[0].value);
      setIcon(editing.icon || EXPENSE_ICONS[0]);
      setNeed(editing.isNeed ? 'need' : 'want');
    } else if (open && !editing) {
      setName(''); setColor(COLOR_SWATCHES[0].value); setIcon(EXPENSE_ICONS[0]); setNeed('want');
    }
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Give the category a name.'); return; }
    setSaving(true);
    const base = kind === 'income'
      ? { name: name.trim(), color, icon }
      : { name: name.trim(), color, icon, is_need: need === 'need' };
    const { error } = isEdit
      ? await supabase.from(table).update(base).eq('id', editing.id)
      : await supabase.from(table).insert({ user_id: user.id, ...base, ...(kind === 'income' ? { is_passive: false } : {}) });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  const iconOpts = EXPENSE_ICONS.map((i) => ({ value: i, color: i === icon ? COLOR_SWATCHES[0].color : '#2a3340', icon: i }));

  return (
    <FormSheet open={open} onClose={onClose} title={isEdit ? 'Edit category' : `Add ${kind} category`} onSave={save} saving={saving} saveLabel={isEdit ? 'Save changes' : 'Add category'} bottomInset={bottomInset}>
      <Input label="Category name" placeholder="e.g. Groceries" value={name} onChange={setName} />
      <SwatchPicker options={COLOR_SWATCHES} value={color} onChange={setColor} />
      <SwatchPicker options={iconOpts} value={icon} onChange={setIcon} />
      {kind === 'expense' ? (
        <SegmentField label="Need or want" options={[{ value: 'need', label: 'Need' }, { value: 'want', label: 'Want' }]} value={need} onChange={setNeed} />
      ) : null}
    </FormSheet>
  );
}
