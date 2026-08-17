import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, num, shadow } from '../theme/tokens';
import { Card, Button, Icon, Sparkline, SectionHeader } from '../components';
import { AnimatedNumber } from '../components/motion';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useNetWorth, ASSET_CATEGORIES, LIABILITY_CATEGORIES } from '../hooks/useNetWorth';
import { ErrorState } from '../components/ErrorState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import NetWorthSheet from '../sheets/NetWorthSheets';
import { bumpRefresh } from '../contexts/RefreshContext';

const catLabel = (list, v) => (list.find((x) => x.value === v)?.label || v);

export default function NetWorthScreen() {
  const { data, loading, error, reload } = useNetWorth();
  const { settings } = useSettings();
  const m = (n) => money(n, { currency: settings.currency });
  const [sheet, setSheet] = useState(null); // {kind, editing}

  const onLong = (kind, item) =>
    Alert.alert(item.name, undefined, [
      { text: 'Edit', onPress: () => setSheet({ kind, editing: item }) },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error: e } = await supabase.from(kind === 'asset' ? 'assets' : 'liabilities').delete().eq('id', item.id);
          if (e) Alert.alert('Could not delete', e.message); else bumpRefresh();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { netWorth, totalAssets, totalLiabilities, accountAssets, accountLiabs, assets, liabilities, trackedDebts, trend, multiCurrency } = data;
  const approx = multiCurrency ? '≈ ' : '';

  const Row = ({ kind, item, list }) => (
    <Pressable onLongPress={() => onLong(kind, item)} delayLongPress={300} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 54 }, pressed && { backgroundColor: c('surfaceHover') }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{item.name}</Text>
        <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{catLabel(list, item.category)}</Text>
      </View>
      <Text style={[num(700), { fontSize: 15, color: kind === 'asset' ? c('income') : c('expense') }]}>{m(item.value)}</Text>
    </Pressable>
  );

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c('primary', 0.25), padding: 18, overflow: 'hidden' }}>
        <LinearGradient colors={[c('primary', 0.12), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>Net worth</Text>
        <AnimatedNumber value={netWorth} format={(n) => `${approx}${m(n)}`} style={[num(700), { fontSize: 30, color: c('fg'), letterSpacing: -0.45, marginTop: 4 }]} />
        {multiCurrency ? <Text style={{ fontSize: 10, color: c('fgMuted'), marginTop: 2 }}>{`Converted to ${settings.currency} at today's rates`}</Text> : null}
        {trend ? <View style={{ marginTop: 10 }}><Sparkline color={c('primary')} data={trend} height={56} /></View> : null}
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' }}>Assets</Text>
            <Text style={[num(600), { fontSize: 15, color: c('income'), marginTop: 2 }]}>{m(totalAssets)}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: c('border', 0.5) }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' }}>Liabilities</Text>
            <Text style={[num(600), { fontSize: 15, color: c('expense'), marginTop: 2 }]}>{m(totalLiabilities)}</Text>
          </View>
        </View>
      </View>

      <SectionHeader title="Assets" action={<Pressable hitSlop={8} onPress={() => setSheet({ kind: 'asset', editing: null })}><Text style={{ color: c('primary'), fontSize: 12, fontFamily: ff.med }}>+ Add</Text></Pressable>} />
      <Card padded={false}>
        {accountAssets > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 54, borderBottomWidth: assets.length ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>Accounts</Text><Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>From your linked accounts</Text></View>
            <Text style={[num(700), { fontSize: 15, color: c('income') }]}>{m(accountAssets)}</Text>
          </View>
        ) : null}
        {assets.map((a, i) => (
          <View key={a.id} style={{ borderTopWidth: accountAssets > 0 || i > 0 ? 1 : 0, borderTopColor: c('border', 0.4) }}>
            <Row kind="asset" item={a} list={ASSET_CATEGORIES} />
          </View>
        ))}
        {assets.length === 0 && accountAssets === 0 ? <Text style={{ fontSize: 13, color: c('fgMuted'), padding: 16 }}>No assets yet. Add property, vehicles or investments.</Text> : null}
      </Card>

      <SectionHeader title="Liabilities" action={<Pressable hitSlop={8} onPress={() => setSheet({ kind: 'liability', editing: null })}><Text style={{ color: c('primary'), fontSize: 12, fontFamily: ff.med }}>+ Add</Text></Pressable>} />
      <Card padded={false}>
        {accountLiabs > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 54, borderBottomWidth: liabilities.length ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>Credit accounts</Text></View>
            <Text style={[num(700), { fontSize: 15, color: c('expense') }]}>{m(accountLiabs)}</Text>
          </View>
        ) : null}
        {/* Loans from the Debt tracker are liabilities too, and they now count
            toward net worth — so list them here, otherwise the total wouldn't
            reconcile with what's shown. Read-only: they're edited in Debt. */}
        {(trackedDebts || []).map((d) => (
          <View key={`debt-${d.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 54, borderTopWidth: 1, borderTopColor: c('border', 0.4) }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{d.name}</Text>
              <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>Tracked in Debt</Text>
            </View>
            <Text style={[num(700), { fontSize: 15, color: c('expense') }]}>{m(d.value)}</Text>
          </View>
        ))}
        {liabilities.map((l, i) => (
          <View key={l.id} style={{ borderTopWidth: accountLiabs > 0 || (trackedDebts || []).length > 0 || i > 0 ? 1 : 0, borderTopColor: c('border', 0.4) }}>
            <Row kind="liability" item={l} list={LIABILITY_CATEGORIES} />
          </View>
        ))}
        {liabilities.length === 0 && accountLiabs === 0 && (trackedDebts || []).length === 0 ? <Text style={{ fontSize: 13, color: c('fgMuted'), padding: 16 }}>No liabilities. Add loans or mortgages you owe.</Text> : null}
      </Card>

      <NetWorthSheet open={!!sheet} kind={sheet?.kind} editing={sheet?.editing} onClose={() => setSheet(null)} onSaved={reload} />
    </View>
  );
}
