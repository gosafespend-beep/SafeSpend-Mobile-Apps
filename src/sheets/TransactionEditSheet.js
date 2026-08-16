import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { FormSheet, AmountField, DateField } from '../components/FormSheet';
import { Input } from '../components';
import { c, hsl, ff } from '../theme/tokens';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/date';
import { rememberRule } from '../lib/merchantRules';
import { haptics } from '../lib/haptics';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { toUsd } from '../lib/fx';
import { useCategories } from '../hooks/useCategories';
import { currencySymbol } from '../lib/format';
import { bumpRefresh } from '../contexts/RefreshContext';

function parseId(id) {
  const [prefix, rest] = String(id || '').split(/-(.+)/);
  const table = prefix === 'e' ? 'expenses' : prefix === 'i' ? 'incomes' : null;
  return { table, rawId: rest };
}

export default function TransactionEditSheet({ open, onClose, onSaved, txn, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { convert, hasRate } = useFx();
  const { data: catData } = useCategories();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const isIncome = txn?.type === 'income';

  useEffect(() => {
    if (txn) {
      setAmount(String(txn.amount ?? ''));
      setCategory(txn.cat || '');
      setNote(txn.note || '');
      setDate(txn.date || todayISO());
    }
  }, [txn]);

  // Real categories for this type, plus the current one if it's no longer in the list.
  const cats = useMemo(() => {
    const list = (isIncome ? catData.income : catData.expense) || [];
    const names = list.map((x) => ({ name: x.name, color: x.color }));
    if (category && !names.find((n) => n.name === category)) names.unshift({ name: category, color: '215 20% 50%' });
    return names;
  }, [isIncome, catData, category]);

  const save = async () => {
    const { table, rawId } = parseId(txn?.id);
    if (!table || !rawId) { Alert.alert('Cannot edit', 'This transaction cannot be edited here.'); return; }
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) { Alert.alert('Enter an amount', 'Amount must be greater than 0.'); return; }
    setSaving(true);
    // Re-stamp the USD value: a changed amount must not keep its old stamp.
    // (Uses today's rate — imperfect for old dates, but never silently stale.)
    const usd = toUsd(amt, txn.currency || settings.currency, { convert, hasRate });
    const patch = table === 'incomes'
      ? { amount: amt, source: category || 'Income', note: note || null, date, amount_usd: usd }
      : { amount: amt, category: category || null, note: note || null, date, amount_usd: usd };
    const { error } = await supabase.from(table).update(patch).eq('id', rawId);
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    // Learn this merchant→category so future captures of the same note auto-fill.
    if (table === 'expenses' && note && category) rememberRule(user?.id, note, category);
    haptics.success();
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title="Edit transaction" onSave={save} saving={saving} saveLabel="Save changes" bottomInset={bottomInset}>
      <AmountField label="Amount" value={amount} onChange={setAmount} symbol={currencySymbol(txn?.currency || settings.currency)} />
      <View>
        <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>{isIncome ? 'Source' : 'Category'}</Text>
        {cats.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {cats.map((x) => {
              const active = category === x.name;
              const col = hsl(x.color);
              return (
                <Pressable key={x.id || x.name} onPress={() => setCategory(x.name)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? c('primary', 0.12) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? c('primary') : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: col }} />
                  <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{x.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Input placeholder={isIncome ? 'e.g. Paycheck' : 'e.g. Groceries'} value={category} onChange={setCategory} />
        )}
      </View>
      <DateField label="Date" value={date} onChange={setDate} />
      <Input label="Note (optional)" placeholder="What was it for?" value={note} onChange={setNote} />
    </FormSheet>
  );
}
