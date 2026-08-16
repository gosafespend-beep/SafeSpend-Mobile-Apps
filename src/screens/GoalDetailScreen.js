import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, hsl, ff, num, glow } from '../theme/tokens';
import { Card, RingProgress, Icon } from '../components';
import { money } from '../lib/format';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { useGoalContributions } from '../hooks/useDetails';
import { ContributionSheet } from '../sheets/GoalSheets';

function fullDate(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso + 'T00:00:00'));
}

export default function GoalDetailScreen({ goal, onChanged }) {
  const { settings } = useSettings();
  const { convert } = useFx();
  const m0 = (n) => money(n, { currency: settings.currency, cents: false });
  const g = goal || { id: null, name: 'Goal', icon: 'target', color: '168 76% 42%', current: 0, target: 0, deadline: null, perMo: null };
  const { items, loading } = useGoalContributions(g.id);
  // Contributions are denominated in the goal's own currency; the header above is
  // shown in the display currency, so convert each one to match (a $5,000
  // contribution to a USD goal must not render as "Ksh 5,000").
  const gc = g.currency || settings.currency;
  const toDisplay = (n) => convert(Number(n || 0), gc, settings.currency);
  const [contribOpen, setContribOpen] = useState(false);

  const pct = g.target > 0 ? (g.current / g.target) * 100 : 0;
  const remaining = Math.max(0, g.target - g.current);

  const plan = [
    { label: 'Saved', value: `${Math.round(pct)}%`, mono: true },
    { label: 'Deadline', value: g.deadline || '—', mono: false },
    { label: 'Suggested/mo', value: g.perMo ? m0(g.perMo) : '—', mono: true },
  ];

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 14 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: hsl(g.color, 0.3), padding: 22, alignItems: 'center', overflow: 'hidden' }}>
        <LinearGradient colors={[hsl(g.color, 0.14), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <RingProgress percentage={Math.min(pct, 100)} size={130} strokeWidth={9} color={hsl(g.color)}>
          <View style={{ alignItems: 'center' }}>
            <Icon name={g.icon} size={26} color={hsl(g.color)} />
            <Text style={[num(700), { fontSize: 18, color: c('fg'), marginTop: 2 }]}>{`${Math.round(pct)}%`}</Text>
          </View>
        </RingProgress>
        <Text style={{ fontSize: 18, fontFamily: ff.bold, color: c('fg'), marginTop: 14, letterSpacing: -0.18 }}>{g.name}</Text>
        <Text style={[num(400), { fontSize: 13, color: c('fgMuted'), marginTop: 6 }]}>{`${m0(g.current)} of ${m0(g.target)}`}</Text>
        {remaining > 0 ? <Text style={[num(600), { fontSize: 12, color: hsl(g.color), marginTop: 4 }]}>{`${m0(remaining)} to go`}</Text> : <Text style={{ fontSize: 12, color: c('income'), marginTop: 4, fontFamily: ff.med }}>🎉 Goal reached!</Text>}
        <Pressable onPress={() => setContribOpen(true)} style={({ pressed }) => [{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 12, backgroundColor: hsl(g.color), flexDirection: 'row', alignItems: 'center', gap: 8, ...glow(hsl(g.color), 0.5) }, pressed && { opacity: 0.9 }]}>
          <Icon name="plus" size={16} stroke={2.5} color="#fff" />
          <Text style={{ fontFamily: ff.semi, fontSize: 14, color: '#fff' }}>Add Contribution</Text>
        </Pressable>
      </View>

      <Card title="Plan">
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {plan.map((x) => (
            <View key={x.label} style={{ flex: 1, alignItems: 'center', padding: 10, borderRadius: 9, backgroundColor: c('surfaceSecondary') }}>
              <Text style={{ fontSize: 9, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' }}>{x.label}</Text>
              <Text style={[x.mono ? num(600) : { fontFamily: ff.semi }, { fontSize: 13, color: x.mono ? c('primary') : c('fg'), marginTop: 4 }]}>{x.value}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card title="Contributions" padded={false}>
        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
        ) : items.length === 0 ? (
          <Text style={{ fontSize: 13, color: c('fgMuted'), paddingVertical: 16, textAlign: 'center' }}>No contributions logged yet.</Text>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: c('border', 0.5), marginTop: 4 }}>
            {items.map((co, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
                <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: hsl(g.color) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('fg') }}>{fullDate(co.date)}</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{co.note}</Text>
                </View>
                <Text style={[num(600), { fontSize: 14, color: c('income') }]}>{`+${m0(toDisplay(co.amount))}`}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <ContributionSheet open={contribOpen} goal={g} onClose={() => setContribOpen(false)} onSaved={() => onChanged && onChanged()} />
    </View>
  );
}
