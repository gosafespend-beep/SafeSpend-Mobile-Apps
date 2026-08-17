import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, hsl, ff, num, shadow } from '../theme/tokens';
import { SectionHeader, Button, Icon } from '../components';
import { Reveal } from '../components/motion';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAccounts } from '../hooks/useAccounts';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import AccountSheet from '../sheets/AccountSheet';
import TransferSheet from '../sheets/TransferSheet';
import ActionSheet from '../components/ActionSheet';

export default function AccountsScreen({ onOpen }) {
  const { data, loading, error, reload } = useAccounts();
  const { settings } = useSettings();
  const { hasRate } = useFx();
  const m = (n) => money(n, { currency: settings.currency });        // display currency
  const ma = (acc) => money(acc.balance, { currency: acc.currency }); // account's own currency
  const [sheet, setSheet] = useState(false);
  const [editAcct, setEditAcct] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [menuAcct, setMenuAcct] = useState(null);

  const onLong = (acc) => setMenuAcct(acc);
  const confirmDelete = (acc) =>
    Alert.alert('Delete account?', 'The account is removed. Its transactions are kept but unlinked.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error: e } = await supabase.rpc('delete_account_cascade', { p_account_id: acc.id });
          if (e) Alert.alert('Could not delete', e.message); else reload();
        },
      },
    ]);

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { accounts, netAssets, netLiabs, netWorth, multiCurrency } = data;
  const approx = multiCurrency ? '≈ ' : '';
  // Currencies we can't actually convert — totals treat them 1:1, so say so.
  const unconvertible = [...new Set(accounts.filter((a) => a.isActive && !hasRate(a.currency)).map((a) => a.currency))];

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      {/* Net worth hero */}
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c('primary', 0.25), padding: 18, overflow: 'hidden' }}>
        <LinearGradient colors={[c('primary', 0.12), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>Total balance</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[num(700), { fontSize: 30, color: c('fg'), letterSpacing: -0.45, marginTop: 4 }]}>{`${approx}${m(netWorth)}`}</Text>
        {multiCurrency ? <Text style={{ fontSize: 10, color: c('fgMuted'), marginTop: 2 }}>{`Converted to ${settings.currency}`}</Text> : null}
        {unconvertible.length ? (
          <Text style={{ fontSize: 10, color: c('warning'), marginTop: 2 }}>{`No exchange rate for ${unconvertible.join(', ')} yet — those amounts are not converted.`}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' }}>Assets</Text>
            <Text style={[num(600), { fontSize: 14, color: c('income'), marginTop: 2 }]}>{`${approx}${m(netAssets)}`}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: c('border', 0.5) }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' }}>Liabilities</Text>
            <Text style={[num(600), { fontSize: 14, color: c('expense'), marginTop: 2 }]}>{`${approx}${m(netLiabs)}`}</Text>
          </View>
        </View>
      </View>

      <SectionHeader title="Accounts" action={<Pressable hitSlop={8} onPress={() => setSheet(true)}><Text style={{ color: c('primary'), fontSize: 12, fontFamily: ff.med }}>+ Add account</Text></Pressable>} />

      {accounts.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="No accounts yet"
          message="Add your cash, bank or card accounts to track balances and net worth."
          actionLabel="Add account"
          onAction={() => setSheet(true)}
        />
      ) : (
        accounts.map((acc, i) => (
          <Reveal key={acc.id} delay={i * 40}>
          <Pressable onPress={() => onOpen && onOpen(acc)} onLongPress={() => onLong(acc)} delayLongPress={300} style={({ pressed }) => [{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 16, ...shadow(1) }, pressed && { backgroundColor: c('surfaceHover') }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: hsl(acc.color, 0.18), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={acc.icon} size={20} color={hsl(acc.color)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{acc.name}</Text>
                <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{acc.currency && acc.currency !== settings.currency ? `${acc.type} · ${acc.currency}` : acc.type}</Text>
                {acc.credit && acc.balance < 0 ? (
                  <Text style={{ fontSize: 10.5, color: c('warning'), marginTop: 2 }}>Balance looks negative — long-press → Edit and re-enter the amount owed.</Text>
                ) : null}
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[num(700), { fontSize: 16, color: acc.credit ? c('expense') : c('fg') }]}>{ma(acc)}</Text>
            </View>
          </Pressable>
          </Reveal>
        ))
      )}

      {accounts.length >= 2 ? (
        <Button block variant="outline" icon="arrowUpDown" style={{ marginTop: 4 }} onPress={() => setTransferOpen(true)}>Transfer between accounts</Button>
      ) : null}

      <AccountSheet open={sheet} onClose={() => setSheet(false)} onSaved={reload} />
      <AccountSheet open={!!editAcct} editing={editAcct} onClose={() => setEditAcct(null)} onSaved={reload} />
      <TransferSheet open={transferOpen} accounts={accounts} onClose={() => setTransferOpen(false)} onSaved={reload} />
      <ActionSheet
        open={!!menuAcct}
        title={menuAcct?.name}
        subtitle={menuAcct ? m(menuAcct.balance) : undefined}
        onClose={() => setMenuAcct(null)}
        options={menuAcct ? [
          { label: 'Edit account', icon: 'pencil', onPress: () => setEditAcct(menuAcct) },
          { label: 'Delete account', icon: 'trash', destructive: true, onPress: () => confirmDelete(menuAcct) },
        ] : []}
      />
    </View>
  );
}
