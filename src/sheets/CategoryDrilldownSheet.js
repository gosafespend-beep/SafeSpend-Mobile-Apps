import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { c, ff, num } from '../theme/tokens';
import { Icon } from '../components';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { usePeriod } from '../contexts/PeriodContext';
import { useFx } from '../contexts/FxContext';

function shortDate(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso + 'T00:00:00'));
}

/** Lists the transactions behind one category for the active period. */
export default function CategoryDrilldownSheet({ open, onClose, category }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { start, end, label } = usePeriod();
  const { convert } = useFx();
  const m = (n) => money(n, { currency: settings.currency });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !category || !user) return;
    let active = true;
    (async () => {
      setLoading(true);
      // Filtered by CATEGORY, not by account, so these rows can span currencies.
      // Both the total and each row render in the display currency (`m`), and this
      // total has to agree with the converted category card that opened the sheet.
      const [{ data }, { data: accts }] = await Promise.all([
        supabase
          .from('expenses').select('id, amount, note, date, category, account_id')
          .eq('user_id', user.id).eq('category', category).gte('date', start).lt('date', end)
          .order('date', { ascending: false }),
        supabase.from('accounts').select('id, currency').eq('user_id', user.id),
      ]);
      const acctCur = {};
      (accts || []).forEach((a) => { acctCur[a.id] = a.currency; });
      const converted = (data || []).map((r) => ({
        ...r,
        amount: convert(Number(r.amount || 0), acctCur[r.account_id] || settings.currency, settings.currency),
      }));
      if (active) { setRows(converted); setLoading(false); }
    })();
    return () => { active = false; };
  }, [open, category, user, start, end, settings.currency, convert]);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: c('bg') }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 }}>
          <View>
            <Text style={{ fontSize: 20, fontFamily: ff.bold, color: c('fg') }}>{category}</Text>
            <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{label}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={18} color={c('fgMuted')} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <Text style={[num(700), { fontSize: 26, color: c('expense'), letterSpacing: -0.3 }]}>{m(total)}</Text>
          <Text style={{ fontSize: 12, color: c('fgMuted') }}>{`${rows.length} transaction${rows.length === 1 ? '' : 's'}`}</Text>
        </View>
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 1 }}>
            {rows.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{r.note || category}</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{shortDate(r.date)}</Text>
                </View>
                <Text style={[num(600), { fontSize: 14, color: c('expense') }]}>{`-${m(Number(r.amount || 0))}`}</Text>
              </View>
            ))}
            {rows.length === 0 ? <Text style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center', padding: 20 }}>No transactions.</Text> : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
