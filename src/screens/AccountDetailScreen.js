import React, { useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, hsl, ff, num } from '../theme/tokens';
import { StatCard, Card, Button, Icon } from '../components';
import { money } from '../lib/format';
import { useSettings } from '../contexts/SettingsContext';
import { useAccountActivity } from '../hooks/useDetails';
import AccountTxnSheet from '../sheets/AccountTxnSheet';

function shortDate(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso + 'T00:00:00'));
}

export default function AccountDetailScreen({ account, onChanged }) {
  const { settings } = useSettings();
  const a = account || { id: null, name: 'Account', type: 'Account', balance: 0, icon: 'wallet', color: '200 70% 50%' };
  // Everything on this screen belongs to one account → its own currency.
  const m = (n) => money(n, { currency: a.currency || settings.currency });
  const { monthIn, monthOut, txns, loading } = useAccountActivity(a.id);
  const [sheet, setSheet] = useState(null); // 'deposit' | 'withdraw' | null

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 14 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: hsl(a.color, 0.25), padding: 20, overflow: 'hidden' }}>
        <LinearGradient colors={[hsl(a.color, 0.14), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: hsl(a.color, 0.22), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={a.icon} size={22} color={hsl(a.color)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{a.name}</Text>
            <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{a.type}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>Balance</Text>
        <Text style={[num(700), { fontSize: 30, color: a.credit ? c('expense') : c('fg'), letterSpacing: -0.45, marginTop: 2 }]}>{m(a.balance)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <View style={{ flex: 1 }}><Button block variant="outline" size="sm" icon="trendingUp" onPress={() => setSheet('deposit')}>Deposit</Button></View>
          <View style={{ flex: 1 }}><Button block variant="outline" size="sm" icon="trendingDown" onPress={() => setSheet('withdraw')}>Withdraw</Button></View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatCard label="Money in" variant="income" value={m(monthIn)} subtitle="This month" />
        <StatCard label="Money out" variant="expense" value={m(monthOut)} subtitle="This month" />
      </View>

      <Card title="Recent activity" padded={false}>
        {loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
        ) : txns.length === 0 ? (
          <Text style={{ fontSize: 13, color: c('fgMuted'), paddingVertical: 16, textAlign: 'center' }}>No activity on this account yet.</Text>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: c('border', 0.5), marginTop: 4 }}>
            {txns.map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i < txns.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.type === 'income' ? c('income', 0.18) : c('expense', 0.16), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.icon} size={17} color={t.type === 'income' ? c('income') : c('expense')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{t.label}</Text>
                  <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{shortDate(t.date)}</Text>
                </View>
                <Text style={[num(600), { fontSize: 14, color: t.type === 'income' ? c('income') : c('expense') }]}>{`${t.type === 'income' ? '+' : '-'}${m(t.amount)}`}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <AccountTxnSheet
        open={!!sheet}
        mode={sheet || 'deposit'}
        account={a}
        onClose={() => setSheet(null)}
        onSaved={() => onChanged && onChanged()}
      />
    </View>
  );
}
