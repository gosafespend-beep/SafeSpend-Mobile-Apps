import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, num, shadow } from '../theme/tokens';
import { ProgressBar, SectionHeader, Button, Icon } from '../components';
import { Reveal } from '../components/motion';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useDebts } from '../hooks/useDebts';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import { useCelebration } from '../contexts/CelebrationContext';
import { AddDebtSheet, PaymentSheet } from '../sheets/DebtSheets';
import ActionSheet from '../components/ActionSheet';
import { bumpRefresh } from '../contexts/RefreshContext';

export default function DebtScreen({ onOpen }) {
  const [method, setMethod] = useState('avalanche');
  const { ordered, total, totalStart, paid, loading, empty, error, reload } = useDebts(method);
  const { settings } = useSettings();
  const m0 = (n) => money(n, { currency: settings.currency, cents: false });
  const [addOpen, setAddOpen] = useState(false);
  const [editDebt, setEditDebt] = useState(null);
  const [payDebt, setPayDebt] = useState(null);
  const [menuDebt, setMenuDebt] = useState(null);
  const { celebrate } = useCelebration();
  const paidOffRef = useRef(null);

  // Celebrate when a debt is *newly* cleared to zero — the big emotional win.
  useEffect(() => {
    if (loading) return;
    const nowPaid = new Set(ordered.filter((d) => d.current <= 0).map((d) => d.id));
    if (paidOffRef.current === null) { paidOffRef.current = nowPaid; return; }
    let justPaid = false;
    nowPaid.forEach((id) => { if (!paidOffRef.current.has(id)) justPaid = true; });
    paidOffRef.current = nowPaid;
    if (justPaid) celebrate('Debt paid off! 🎊');
  }, [ordered, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLong = (d) => setMenuDebt(d);
  const confirmDelete = (d) =>
    Alert.alert('Delete debt?', 'The debt and its payment history will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('debt_payments').delete().eq('debt_id', d.id);
          const { error: e } = await supabase.from('debts').delete().eq('id', d.id);
          if (e) Alert.alert('Could not delete', e.message); else bumpRefresh();
        },
      },
    ]);

  const priColors = {
    high: { bg: c('expense', 0.18), fg: c('expense') },
    medium: { bg: c('warning', 0.18), fg: c('warning') },
    low: { bg: c('surfaceSecondary'), fg: c('fgMuted') },
  };

  if (error && empty) return <ErrorState onRetry={reload} />;
  if (loading && empty) return <ScreenSkeleton rows={3} />;

  const pctPaid = totalStart > 0 ? (paid / totalStart) * 100 : 0;

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      {/* Total debt hero */}
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c('expense', 0.2), padding: 16, overflow: 'hidden' }}>
        <LinearGradient colors={[c('expense', 0.1), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>Total debt remaining</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[num(700), { fontSize: 28, color: c('expense'), letterSpacing: -0.42, marginTop: 4 }]}>{m0(total)}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
          <Text style={{ fontSize: 12, color: c('fgMuted') }}>{`Paid off ${m0(paid)} of ${m0(totalStart)}`}</Text>
          <Text style={[num(600), { fontSize: 12, color: c('income') }]}>{`${Math.round(pctPaid)}%`}</Text>
        </View>
        <View style={{ marginTop: 8 }}>
          <ProgressBar value={pctPaid} color={c('income')} height={6} />
        </View>
      </View>

      {/* Method toggle */}
      <View>
        <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>Payoff strategy</Text>
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c('surfaceSecondary'), borderRadius: 11 }}>
          {[
            ['avalanche', 'Avalanche', 'Highest APR first'],
            ['snowball', 'Snowball', 'Smallest balance first'],
          ].map(([id, label, hint]) => {
            const active = method === id;
            return (
              <Pressable key={id} onPress={() => setMethod(id)} style={[{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', gap: 2 }, active && { backgroundColor: c('surface'), ...shadow(1) }]}>
                <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>{label}</Text>
                <Text style={{ fontSize: 10, color: c('fgMuted') }}>{hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SectionHeader title="Debts in payoff order" action={<Pressable hitSlop={8} onPress={() => setAddOpen(true)}><Text style={{ color: c('primary'), fontSize: 12, fontFamily: ff.med }}>+ Add debt</Text></Pressable>} />

      {/* This screen only knows about debts added here — it can't see what's owed
          on credit accounts. Claiming "You're debt free 🎉" to someone carrying a
          card balance is a confident falsehood about their money, so state what's
          actually true: nothing is TRACKED here yet. */}
      {empty ? (
        <EmptyState
          icon="scale"
          tone={c('fgMuted')}
          title="No debts tracked yet"
          message="Add a loan or card balance and we'll build your payoff plan. Balances on credit accounts are tracked separately under Accounts."
          actionLabel="Add debt"
          onAction={() => setAddOpen(true)}
        />
      ) : null}

      {ordered.map((d, i) => {
        const pct = d.starting > 0 ? ((d.starting - d.current) / d.starting) * 100 : 0;
        const col = priColors[d.priority];
        return (
          <Reveal key={d.id} delay={i * 40}>
          <Pressable onPress={() => onOpen && onOpen(d)} onLongPress={() => onLong(d)} delayLongPress={300} style={({ pressed }) => [{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 16, ...shadow(1) }, pressed && { backgroundColor: c('surfaceHover') }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c('primary', 0.2), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[num(700), { fontSize: 14, color: c('primary') }]}>{`#${i + 1}`}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{d.name}</Text>
                  <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 9999, backgroundColor: col.bg }}>
                    <Text style={{ fontSize: 10, fontFamily: ff.semi, color: col.fg }}>{d.priority}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Text style={[num(400), { fontSize: 11, color: c('fgMuted') }]}>{`${d.apr}% APR`}</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted') }}>·</Text>
                  <Text style={[num(400), { fontSize: 11, color: c('fgMuted') }]}>{`${m0(d.min)}/mo min`}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[num(700), { fontSize: 16, color: c('expense') }]}>{m0(d.current)}</Text>
                <Text style={[num(400), { fontSize: 10, color: c('fgMuted'), marginTop: 2 }]}>{`of ${m0(d.starting)}`}</Text>
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: c('fgMuted') }}>Progress</Text>
                <Text style={{ fontSize: 11, color: c('income'), fontFamily: ff.semi }}>{`${pct.toFixed(0)}% paid`}</Text>
              </View>
              <ProgressBar value={pct} color={c('income')} height={5} />
            </View>
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Button size="sm" variant="outline" icon="plus" onPress={() => setPayDebt(d)}>Make Payment</Button>
              <Button size="sm" variant="ghost" onPress={() => onOpen && onOpen(d)}>Details</Button>
            </View>
          </Pressable>
          </Reveal>
        );
      })}

      <AddDebtSheet open={addOpen} onClose={() => setAddOpen(false)} onSaved={reload} />
      <AddDebtSheet open={!!editDebt} editing={editDebt} onClose={() => setEditDebt(null)} onSaved={reload} />
      <PaymentSheet open={!!payDebt} debt={payDebt} onClose={() => setPayDebt(null)} onSaved={reload} />
      <ActionSheet
        open={!!menuDebt}
        title={menuDebt?.name}
        onClose={() => setMenuDebt(null)}
        options={menuDebt ? [
          { label: 'Make payment', icon: 'plus', onPress: () => setPayDebt(menuDebt) },
          { label: 'Edit debt', icon: 'pencil', onPress: () => setEditDebt(menuDebt) },
          { label: 'Delete debt', icon: 'trash', destructive: true, onPress: () => confirmDelete(menuDebt) },
        ] : []}
      />
    </View>
  );
}
