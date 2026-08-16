import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { c, ff, num, shadow } from '../theme/tokens';
import { Button, Icon } from '../components';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useRecurring } from '../hooks/useRecurring';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { useSettings } from '../contexts/SettingsContext';
import RecurringSheet from '../sheets/RecurringSheet';
import { bumpRefresh } from '../contexts/RefreshContext';

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly' };

function dueLabel(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso + 'T00:00:00'));
}

export default function RecurringScreen() {
  const { rows, loading, error, reload, empty } = useRecurring();
  const { settings } = useSettings();
  const m = (n) => money(n, { currency: settings.currency });
  const [add, setAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const onLong = (r) =>
    Alert.alert(r.description || r.category, undefined, [
      { text: 'Edit', onPress: () => setEditItem(r) },
      {
        text: r.isActive ? 'Pause' : 'Resume', onPress: async () => {
          await supabase.from('recurring_transactions').update({ is_active: !r.isActive }).eq('id', r.id); bumpRefresh();
        },
      },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error: e } = await supabase.from('recurring_transactions').delete().eq('id', r.id);
          if (e) Alert.alert('Could not delete', e.message); else bumpRefresh();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  if (error && empty) return <ErrorState onRetry={reload} />;
  if (loading && empty) return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>;

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      <Button block variant="outline" icon="plus" onPress={() => setAdd(true)}>Add recurring</Button>

      {empty ? (
        <EmptyState
          icon="arrowUpDown"
          tone="#a78bfa"
          title="No recurring transactions"
          message="Add salary, rent or subscriptions once and SafeSpend logs them automatically each period."
          actionLabel="Add recurring"
          onAction={() => setAdd(true)}
        />
      ) : null}

      {rows.map((r) => {
        const income = r.type === 'income';
        const tone = income ? c('income') : c('expense');
        return (
          <Pressable key={r.id} onLongPress={() => onLong(r)} delayLongPress={300} style={({ pressed }) => [{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 16, opacity: r.isActive ? 1 : 0.5, ...shadow(1) }, pressed && { backgroundColor: c('surfaceHover') }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: income ? c('income', 0.16) : c('expense', 0.14), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={income ? 'trendingUp' : 'arrowUpDown'} size={18} color={tone} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{r.description || r.category}</Text>
                <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{`${FREQ_LABEL[r.frequency] || r.frequency} · next ${dueLabel(r.nextDue)}${r.isActive ? '' : ' · paused'}`}</Text>
              </View>
              <Text style={[num(700), { fontSize: 15, color: tone }]}>{`${income ? '+' : '-'}${m(r.amount)}`}</Text>
            </View>
          </Pressable>
        );
      })}

      <RecurringSheet open={add} onClose={() => setAdd(false)} onSaved={reload} />
      <RecurringSheet open={!!editItem} editing={editItem} onClose={() => setEditItem(null)} onSaved={reload} />
    </View>
  );
}
