import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, num } from '../theme/tokens';
import { Card, ProgressBar, Button, Icon } from '../components';
import { money } from '../lib/format';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { useDebtPayments } from '../hooks/useDetails';
import { PaymentSheet } from '../sheets/DebtSheets';

function fullDate(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso + 'T00:00:00'));
}

export default function DebtDetailScreen({ debt, onChanged }) {
  const { settings } = useSettings();
  const { convert } = useFx();
  const m = (n) => money(n, { currency: settings.currency });
  const d = debt || { id: null, name: 'Debt', apr: 0, min: 0, current: 0, starting: 0 };
  const { items, loading } = useDebtPayments(d.id);
  // Payments are denominated in the debt's own currency; convert to the display
  // currency so the history matches the converted balance shown above.
  const dc = d.currency || settings.currency;
  const toDisplay = (n) => convert(Number(n || 0), dc, settings.currency);
  const [payOpen, setPayOpen] = useState(false);

  const paid = Math.max(0, d.starting - d.current);
  const pct = d.starting > 0 ? (paid / d.starting) * 100 : 0;
  // Honest estimate: months to clear the balance at the minimum payment (interest ignored).
  const monthsAtMin = d.min > 0 ? Math.ceil(d.current / d.min) : null;

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 14 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c('expense', 0.25), padding: 22, overflow: 'hidden' }}>
        <LinearGradient colors={[c('expense', 0.1), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c('expense', 0.18), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="creditCard" size={20} color={c('expense')} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: ff.semi, color: c('fg') }}>{d.name}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Text style={[num(400), { fontSize: 11, color: c('fgMuted') }]}>{`${d.apr}% APR`}</Text>
              <Text style={{ fontSize: 11, color: c('fgMuted') }}>·</Text>
              <Text style={[num(400), { fontSize: 11, color: c('fgMuted') }]}>{`Min ${m(d.min)}`}</Text>
            </View>
          </View>
        </View>
        <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>Remaining</Text>
        <Text style={[num(700), { fontSize: 32, color: c('expense'), letterSpacing: -0.48, marginTop: 2 }]}>{m(d.current)}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
          <Text style={{ fontSize: 12, color: c('fgMuted') }}>{`Paid ${m(paid)} of ${m(d.starting)}`}</Text>
          <Text style={[num(600), { fontSize: 12, color: c('income') }]}>{`${Math.round(pct)}%`}</Text>
        </View>
        <View style={{ marginTop: 6 }}>
          <ProgressBar value={pct} color={c('income')} height={6} />
        </View>
      </View>

      <Card title="Summary">
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: c('surfaceSecondary') }}>
            <Text style={{ fontSize: 10, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' }}>Interest rate</Text>
            <Text style={[num(700), { fontSize: 16, color: c('expense'), marginTop: 4 }]}>{`${d.apr}%`}</Text>
          </View>
          <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: c('primary', 0.1), borderWidth: 1, borderColor: c('primary', 0.2) }}>
            <Text style={{ fontSize: 10, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' }}>At min payment</Text>
            <Text style={[num(700), { fontSize: 16, color: c('primary'), marginTop: 4 }]}>{monthsAtMin ? `~${monthsAtMin} mo` : '—'}</Text>
            <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>to clear balance</Text>
          </View>
        </View>
      </Card>

      <Button block size="lg" icon="plus" onPress={() => setPayOpen(true)}>Make Payment</Button>

      <Card title="Payment history" padded={false}>
        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
        ) : items.length === 0 ? (
          <Text style={{ fontSize: 13, color: c('fgMuted'), paddingVertical: 16, textAlign: 'center' }}>No payments logged yet.</Text>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: c('border', 0.5), marginTop: 4 }}>
            {items.map((p, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c('income', 0.18), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={16} color={c('income')} stroke={2.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('fg') }}>{fullDate(p.date)}</Text>
                  <Text style={[num(400), { fontSize: 11, color: c('fgMuted'), marginTop: 2 }]}>{p.note}</Text>
                </View>
                <Text style={[num(600), { fontSize: 14, color: c('income') }]}>{`-${m(toDisplay(p.amount))}`}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <PaymentSheet open={payOpen} debt={d} onClose={() => setPayOpen(false)} onSaved={() => onChanged && onChanged()} />
    </View>
  );
}
