import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { c, alpha, ff, num, R } from '../theme/tokens';
import { Icon } from '../components';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useTransactions } from '../hooks/useTransactions';
import { PeriodSelector } from '../components/PeriodSelector';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { useToast } from '../contexts/ToastContext';
import TransactionEditSheet from '../sheets/TransactionEditSheet';
import { bumpRefresh } from '../contexts/RefreshContext';

const CHIPS = ['All', 'Income', 'Expenses'];
const ACTION_W = 68;

/** Swipe action button behind a row. */
function RowAction({ icon, label, color, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: pressed ? alpha(color, 0.85) : color }]}
    >
      <Icon name={icon} size={17} color="#fff" stroke={2.2} />
      <Text style={{ fontSize: 10, fontFamily: ff.med, color: '#fff' }}>{label}</Text>
    </Pressable>
  );
}

export default function LogScreen({ onOpenTxn, onSearch }) {
  const [filter, setFilter] = useState('All');
  const { days, loading, error, reload, empty } = useTransactions(filter);
  const { settings } = useSettings();
  const { convert } = useFx();
  const { show } = useToast();
  const m = (n, sign) => money(n, { currency: settings.currency, sign });
  const mt = (t) => money(t.amount, { currency: t.currency || settings.currency }); // per-row native currency

  const [editTxn, setEditTxn] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await reload(); setRefreshing(false); };
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const pendingRef = useRef(new Map()); // id → { timer, txn }
  const rowRefs = useRef(new Map()); // id → Swipeable

  // Actually delete a soft-deleted row in the DB once its undo window closes.
  const commitDelete = useCallback(async (id) => {
    const entry = pendingRef.current.get(id);
    if (!entry) return;
    pendingRef.current.delete(id);
    const [prefix, rawId] = String(id).split(/-(.+)/);
    const table = prefix === 'e' ? 'expenses' : prefix === 'i' ? 'incomes' : null;
    if (!table || !rawId) return;
    const { error: e } = await supabase.from(table).delete().eq('id', rawId);
    if (!e) {
      // The row was only hidden locally until now. Without a global signal the
      // delete never reached the Dashboard, Reports or net worth — they kept
      // counting a transaction the user had already removed.
      bumpRefresh();
    }
    if (e) {
      // Failed — resurface the row and tell the user.
      setHiddenIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      Alert.alert('Could not delete', e.message);
    }
  }, []);

  // Leaving the screen flushes pending deletes so "deleted" is never silently undone.
  useEffect(() => () => {
    for (const [id, entry] of pendingRef.current) {
      clearTimeout(entry.timer);
      entry.timer = null;
      commitDelete(id);
    }
  }, [commitDelete]);

  const softDelete = (t) => {
    rowRefs.current.get(t.id)?.close();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setHiddenIds((prev) => new Set(prev).add(t.id));
    const timer = setTimeout(() => commitDelete(t.id), 4000);
    pendingRef.current.set(t.id, { timer, txn: t });
    show(`Deleted “${t.label}”`, {
      icon: 'trash',
      action: 'Undo',
      onAction: () => {
        const entry = pendingRef.current.get(t.id);
        if (entry) { clearTimeout(entry.timer); pendingRef.current.delete(t.id); }
        setHiddenIds((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
      },
    });
  };

  const openEdit = (t) => {
    rowRefs.current.get(t.id)?.close();
    setEditTxn(t);
  };

  // Flatten day groups into one list with sticky header rows; drop soft-deleted
  // rows and recompute day totals so headers stay truthful mid-undo.
  const { items, stickyIndices } = useMemo(() => {
    const out = [];
    const sticky = [];
    days.forEach((day) => {
      const visible = day.items.filter((t) => !hiddenIds.has(t.id));
      if (!visible.length) return;
      // Day totals are rendered in the DISPLAY currency, so each row has to be
      // converted out of its own account's currency first. Summing raw amounts
      // printed a display-currency symbol over an unconverted figure — a Ksh
      // 35,000 expense showed as "-$35,000.00", off by the whole FX rate.
      const total = visible.reduce(
        (acc, t) => {
          const v = convert(t.amount, t.currency || settings.currency, settings.currency);
          if (t.type === 'income') acc.in += v; else acc.out += v;
          return acc;
        },
        { in: 0, out: 0 }
      );
      sticky.push(out.length);
      out.push({ kind: 'header', key: `h-${day.date}`, label: day.label, total });
      visible.forEach((t, i) => {
        out.push({ kind: 'txn', key: t.id, txn: t, first: i === 0, last: i === visible.length - 1 });
      });
    });
    return { items: out, stickyIndices: sticky };
  }, [days, hiddenIds, convert, settings.currency]);

  const renderItem = ({ item }) => {
    if (item.kind === 'header') {
      return (
        <View style={{ backgroundColor: c('bg'), paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>{item.label}</Text>
          <Text style={[num(400), { fontSize: 11 }]}>
            {item.total.in > 0 ? <Text style={{ color: c('income') }}>{`${m(item.total.in, true)} `}</Text> : null}
            {item.total.out > 0 ? <Text style={{ color: c('expense') }}>{`-${m(item.total.out)}`}</Text> : null}
          </Text>
        </View>
      );
    }
    const t = item.txn;
    const iconColor = t.type === 'income' ? c('income') : c('expense');
    return (
      <View style={{ marginHorizontal: 14 }}>
        <Swipeable
          ref={(ref) => { if (ref) rowRefs.current.set(t.id, ref); else rowRefs.current.delete(t.id); }}
          overshootRight={false}
          friction={2}
          rightThreshold={36}
          renderRightActions={() => (
            <View style={{ flexDirection: 'row', borderTopRightRadius: item.first ? R.card : 0, borderBottomRightRadius: item.last ? R.card : 0, overflow: 'hidden', marginLeft: -R.card }}>
              <RowAction icon="pencil" label="Edit" color={c('primary')} onPress={() => openEdit(t)} />
              <RowAction icon="trash" label="Delete" color={c('expense')} onPress={() => softDelete(t)} />
            </View>
          )}
        >
          <Pressable
            onPress={() => onOpenTxn && onOpenTxn(t)}
            style={({ pressed }) => [
              {
                flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56,
                backgroundColor: pressed ? c('surfaceHover') : c('surface'),
                borderColor: c('border'), borderLeftWidth: 1, borderRightWidth: 1,
                borderTopWidth: item.first ? 1 : 0, borderBottomWidth: item.last ? 1 : 1,
                borderBottomColor: item.last ? c('border') : c('border', 0.4),
                borderTopLeftRadius: item.first ? R.card : 0, borderTopRightRadius: item.first ? R.card : 0,
                borderBottomLeftRadius: item.last ? R.card : 0, borderBottomRightRadius: item.last ? R.card : 0,
              },
            ]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: alpha(iconColor, 0.15), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={t.icon} size={17} color={iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{t.label}</Text>
              <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{`${t.cat}${t.time ? ` · ${t.time}` : ''}`}</Text>
            </View>
            <Text style={[num(600), { fontSize: 14, color: iconColor }]}>
              {`${t.type === 'income' ? '+' : '-'}${mt(t)}`}
            </Text>
          </Pressable>
        </Swipeable>
      </View>
    );
  };

  const ListHeader = (
    <View style={{ paddingTop: 14 }}>
      <View style={{ paddingHorizontal: 14, marginBottom: 4 }}><PeriodSelector /></View>
      {/* Search — visibly a button, opens the full search screen */}
      <View style={{ paddingHorizontal: 14 }}>
        <Pressable
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel="Search transactions"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 14, backgroundColor: pressed ? c('surfaceHover') : c('input'), borderWidth: 1, borderColor: c('border'), borderRadius: R.input }]}
        >
          <Icon name="search" size={16} color={c('fgMuted')} />
          <Text style={{ fontSize: 14, color: c('fgMuted') }}>Search transactions</Text>
        </Pressable>
      </View>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 6 }}>
        {CHIPS.map((tLabel) => {
          const active = filter === tLabel;
          return (
            <Pressable
              key={tLabel}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilter(tLabel); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              hitSlop={6}
              style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 9999, backgroundColor: active ? c('primary') : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? 'transparent' : c('border') }}
            >
              <Text style={{ fontSize: 12, fontFamily: ff.med, color: active ? '#fff' : c('fg') }}>{tLabel}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  let body;
  if (error && empty) {
    body = <View>{ListHeader}<ErrorState onRetry={reload} /></View>;
  } else if (loading && empty) {
    body = <View>{ListHeader}<View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View></View>;
  } else if (empty) {
    body = (
      <View>
        {ListHeader}
        <EmptyState
          icon="receipt"
          title="No transactions yet"
          message="Tap the + button below to log your first income or expense — it takes seconds."
        />
      </View>
    );
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.kind}
        estimatedItemSize={60}
        stickyHeaderIndices={stickyIndices}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c('primary')} colors={[c('primary')]} />}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {body}
      <TransactionEditSheet
        open={!!editTxn}
        txn={editTxn}
        onClose={() => setEditTxn(null)}
        onSaved={() => { setEditTxn(null); bumpRefresh(); }}
      />
    </View>
  );
}
