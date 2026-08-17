import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { c, hsl, ff, shadow } from '../theme/tokens';
import { Card, Button, Icon } from '../components';
import { Reveal } from '../components/motion';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import ActionSheet from '../components/ActionSheet';
import { supabase } from '../lib/supabase';
import { useCategories } from '../hooks/useCategories';
import CategorySheet from '../sheets/CategorySheet';
import { bumpRefresh } from '../contexts/RefreshContext';

export default function CategoriesScreen() {
  const [tab, setTab] = useState('expense');
  const [sheet, setSheet] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [menuCat, setMenuCat] = useState(null);
  const { data, loading, reload } = useCategories();
  const cats = tab === 'expense' ? data.expense : data.income;
  const table = tab === 'income' ? 'income_categories' : 'categories';

  const confirmDelete = (cat) =>
    Alert.alert('Delete category?', 'Existing transactions keep their label.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from(table).delete().eq('id', cat.id);
          if (error) Alert.alert('Could not delete', error.message); else bumpRefresh();
        },
      },
    ]);

  const firstLoad = loading && data.expense.length === 0 && data.income.length === 0;
  if (firstLoad) return <ScreenSkeleton rows={4} />;

  return (
    <View style={{ padding: 14, paddingBottom: 28 }}>
      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c('surfaceSecondary'), borderRadius: 11, marginBottom: 14 }}>
        {['expense', 'income'].map((t) => {
          const active = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="button" accessibilityState={{ selected: active }} style={[{ flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, active && { backgroundColor: c('surface'), ...shadow(1) }]}>
              <Text style={{ fontSize: 13, fontFamily: ff.semi, color: active ? c('fg') : c('fgMuted'), textTransform: 'capitalize' }}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      {cats.length === 0 ? (
        <EmptyState
          icon="shopping"
          tone={tab === 'income' ? c('income') : c('primary')}
          title={`No ${tab} categories yet`}
          message={`Add ${tab} categories to organize where your money ${tab === 'income' ? 'comes from' : 'goes'} — each one gets its own color and icon.`}
          actionLabel="Add category"
          onAction={() => setSheet(true)}
        />
      ) : (
        <Card padded={false}>
          {cats.map((cat, i) => (
            <Reveal key={cat.id || cat.name} delay={i * 35}>
              <Pressable onPress={() => setMenuCat(cat)} onLongPress={() => setMenuCat(cat)} delayLongPress={300} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i < cats.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }, pressed && { backgroundColor: c('surfaceHover') }]}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: hsl(cat.color, 0.2), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={cat.icon} size={17} color={hsl(cat.color)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{cat.name}</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{`${cat.count} transaction${cat.count === 1 ? '' : 's'} this month`}</Text>
                </View>
                <Icon name="more" size={16} color={c('fgMuted')} />
              </Pressable>
            </Reveal>
          ))}
        </Card>
      )}

      <Button block variant="outline" icon="plus" style={{ marginTop: 14 }} onPress={() => setSheet(true)}>Add category</Button>

      <CategorySheet open={sheet} onClose={() => setSheet(false)} onSaved={reload} kind={tab} />
      <CategorySheet open={!!editCat} editing={editCat} kind={tab} onClose={() => setEditCat(null)} onSaved={reload} />
      <ActionSheet
        open={!!menuCat}
        title={menuCat?.name}
        subtitle={menuCat ? `${menuCat.count} transaction${menuCat.count === 1 ? '' : 's'} this month` : undefined}
        onClose={() => setMenuCat(null)}
        options={menuCat ? [
          { label: 'Edit category', icon: 'pencil', onPress: () => setEditCat(menuCat) },
          { label: 'Delete category', icon: 'trash', destructive: true, onPress: () => confirmDelete(menuCat) },
        ] : []}
      />
    </View>
  );
}
