import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { FormSheet, AmountField } from '../components/FormSheet';
import { Icon } from '../components';
import { c, ff, hsl } from '../theme/tokens';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { currencySymbol } from '../lib/format';
import { useCategories } from '../hooks/useCategories';
import { bumpRefresh } from '../contexts/RefreshContext';

/**
 * Create or edit a monthly budget limit for a category.
 * `editing` = { id: category_id, name, limit } edits an existing budget;
 * `budgetedIds` are category ids that already have a budget (hidden when adding).
 */
export default function BudgetSheet({ open, onClose, onSaved, editing = null, budgetedIds = [], bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data: catData, loading: catsLoading } = useCategories();
  const categories = catData.expense; // budgets are limits on expense categories
  const [categoryId, setCategoryId] = useState(null);
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;
  const sym = currencySymbol(settings.currency);

  useEffect(() => {
    if (!open) return;
    if (editing) { setCategoryId(editing.id); setLimit(editing.limit != null ? String(editing.limit) : ''); }
    else { setCategoryId(null); setLimit(''); }
  }, [open, editing]);

  const pickable = (categories || []).filter((cat) => !budgetedIds.includes(cat.id) || cat.id === editing?.id);

  // With exactly one category to choose from, the row reads as a label rather
  // than a choice — you'd type a limit, hit Add, and get "Pick a category" with
  // nothing else to pick. Preselect it; with several, leave the choice explicit.
  useEffect(() => {
    if (!open || editing || categoryId) return;
    if (pickable.length === 1) setCategoryId(pickable[0].id);
  }, [open, editing, categoryId, pickable]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const value = parseFloat(String(limit).replace(/[^0-9.]/g, '')) || 0;
    if (!categoryId) { Alert.alert('Pick a category', 'Choose which category to budget.'); return; }
    if (value <= 0) { Alert.alert('Enter a limit', 'Set a monthly limit greater than zero.'); return; }
    setSaving(true);
    // Stamp the currency the limit was actually typed in. Without it the number
    // was assumed to be in whatever the display currency happened to be at read
    // time, so a 5,000 KES grocery cap silently became a 5,000 USD one.
    const { error } = await supabase.from('budgets').upsert(
      { user_id: user.id, category_id: categoryId, monthly_limit: value, currency: editing?.currency || settings.currency },
      { onConflict: 'user_id,category_id' }
    );
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  const remove = () => {
    Alert.alert('Remove budget?', 'This category will no longer have a spending limit.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setSaving(true);
          const { error } = await supabase.from('budgets').delete().eq('user_id', user.id).eq('category_id', editing.id);
          setSaving(false);
          if (error) { Alert.alert('Could not remove', error.message); return; }
          bumpRefresh(); onSaved && onSaved();
          onClose && onClose();
        },
      },
    ]);
  };

  const selected = (categories || []).find((cat) => cat.id === categoryId);

  return (
    <FormSheet open={open} onClose={onClose} title={isEdit ? 'Edit budget' : 'Add budget'} onSave={save} saving={saving} saveLabel={isEdit ? 'Save budget' : 'Add budget'} bottomInset={bottomInset}>
      {isEdit ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: hsl(selected?.color || '168 76% 42%', 0.18), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={selected?.icon || 'wallet'} size={18} color={hsl(selected?.color || '168 76% 42%')} />
          </View>
          <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>{editing.name}</Text>
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>Category</Text>
          {pickable.length === 0 ? (
            // Three very different situations used to collapse into one message
            // ("All categories already have a budget"), which was flatly wrong
            // for a user who has NO categories — it sent them to edit a list
            // that didn't exist, with no way to create a budget at all.
            <Text style={{ fontSize: 13, color: c('fgMuted') }}>
              {catsLoading
                ? 'Loading your categories…'
                : (categories || []).length === 0
                  ? 'You don’t have any expense categories yet. Add one under More → Categories, then set its budget here.'
                  : 'All categories already have a budget. Edit one from the list instead.'}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {pickable.map((cat) => {
                const active = categoryId === cat.id;
                return (
                  <Pressable key={cat.id} onPress={() => setCategoryId(cat.id)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 10 }, (active || pressed) && { backgroundColor: c('surfaceHover') }]}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: hsl(cat.color, 0.18), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={cat.icon} size={16} color={hsl(cat.color)} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{cat.name}</Text>
                    {active ? <Icon name="check" size={18} color={c('primary')} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      <AmountField label="Monthly limit" value={limit} onChange={setLimit} symbol={sym} />

      {isEdit ? (
        <Pressable onPress={remove} style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('expense') }}>Remove budget</Text>
        </Pressable>
      ) : null}
    </FormSheet>
  );
}
