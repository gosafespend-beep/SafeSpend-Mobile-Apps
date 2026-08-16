import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, hsl, ff, num, TOK } from '../theme/tokens';
import { Card, Button, Icon } from '../components';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/date';
import { useSettings } from '../contexts/SettingsContext';
import { useTransactionDetail } from '../hooks/useDetails';
import TransactionEditSheet from '../sheets/TransactionEditSheet';

export default function TransactionDetailScreen({ txn, onChanged, onClose }) {
  const { settings } = useSettings();
  const extra = useTransactionDetail(txn);
  const [editOpen, setEditOpen] = useState(false);

  const remove = () => {
    const [prefix, rawId] = String(txn?.id || '').split(/-(.+)/);
    const table = prefix === 'e' ? 'expenses' : prefix === 'i' ? 'incomes' : null;
    if (!table || !rawId) { Alert.alert('Cannot delete', 'This transaction cannot be deleted here.'); return; }
    Alert.alert('Delete transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from(table).delete().eq('id', rawId);
          if (error) { Alert.alert('Could not delete', error.message); return; }
          onChanged && onChanged();
          onClose && onClose();
        },
      },
    ]);
  };
  const t = txn || { type: 'expense', label: 'Transaction', cat: '—', amount: 0, date: todayISO(), icon: 'shopping' };

  const isIncome = t.type === 'income';
  const tone = isIncome ? TOK.income : TOK.expense;
  const valueColor = isIncome ? c('income') : c('expense');
  const sign = isIncome ? '+' : '-';
  const dateLabel = t.date ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(t.date + 'T00:00:00')) : '—';

  const fields = [
    { label: 'Category', value: t.cat || '—', icon: t.icon || 'shopping' },
    { label: 'Account', value: extra.account || '—', icon: 'wallet' },
    { label: 'Date', value: dateLabel, icon: 'calendar' },
    { label: 'Time', value: t.time || '—', icon: 'clock' },
    { label: 'Note', value: extra.note || t.note || '—', icon: 'pencil' },
  ];

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 14 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: hsl(tone, 0.25), padding: 22, alignItems: 'center', overflow: 'hidden' }}>
        <LinearGradient colors={[hsl(tone, 0.12), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ width: 60, height: 60, borderRadius: 18, marginBottom: 12, backgroundColor: hsl(tone, 0.22), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={t.icon || 'shopping'} size={28} color={hsl(tone)} />
        </View>
        <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>{isIncome ? 'Income' : 'Expense'}</Text>
        <Text style={[num(700), { fontSize: 36, letterSpacing: -0.72, color: valueColor, marginTop: 4 }]}>{`${sign}${money(t.amount, { currency: t.currency || settings.currency })}`}</Text>
        <Text style={{ fontSize: 14, color: c('fg'), marginTop: 4, fontFamily: ff.med }}>{t.label}</Text>
      </View>

      <Card padded={false}>
        {fields.map((row, i) => (
          <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: i < fields.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
            <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={row.icon} size={14} color={c('fgMuted')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: c('fgMuted'), letterSpacing: 0.4, textTransform: 'uppercase' }}>{row.label}</Text>
              <Text style={{ fontSize: 14, color: c('fg'), marginTop: 2 }}>{row.value}</Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button block variant="outline" icon="pencil" onPress={() => setEditOpen(true)}>Edit</Button></View>
        <View style={{ flex: 1 }}><Button block variant="ghost" icon="trash" style={{ color: c('expense') }} onPress={remove}>Delete</Button></View>
      </View>

      <TransactionEditSheet
        open={editOpen}
        txn={{ ...t, note: extra.note ?? t.note }}
        onClose={() => setEditOpen(false)}
        onSaved={() => { onChanged && onChanged(); onClose && onClose(); }}
      />
    </View>
  );
}
