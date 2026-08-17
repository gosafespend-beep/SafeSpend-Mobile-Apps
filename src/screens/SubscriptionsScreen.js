import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, num } from '../theme/tokens';
import { Card, SectionHeader, Icon, Badge } from '../components';
import { money } from '../lib/format';
import { useSubscriptions } from '../hooks/useSubscriptions';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { advanceDate } from '../lib/recurring';
import { toLocalISODate } from '../lib/date';
import { bumpRefresh } from '../contexts/RefreshContext';

function ago(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

export default function SubscriptionsScreen() {
  const { data, error, reload } = useSubscriptions();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { requireWrite } = useEntitlement();
  const { show } = useToast();
  const m = (n) => money(n, { currency: settings.currency });

  const trackAsRecurring = (s) => requireWrite('add_recurring', async () => {
    try {
      const { error: e } = await supabase.from('recurring_transactions').insert({
        user_id: user.id, type: 'expense', amount: s.amount, description: s.name, category: null,
        frequency: 'monthly', next_due: advanceDate(toLocalISODate(), 'monthly'), is_active: true,
      });
      if (e) throw e;
      show(`Tracking “${s.name}” as recurring`, { icon: 'check' });
      bumpRefresh();
    } catch (err) { Alert.alert('Could not track', err.message); }
  });

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { subscriptions, monthlyTotal, yearlyTotal } = data;

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      {/* Total */}
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c('primary', 0.25), padding: 18, overflow: 'hidden' }}>
        <LinearGradient colors={[c('primary', 0.12), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>Recurring spend / month</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[num(700), { fontSize: 30, color: c('fg'), letterSpacing: -0.45, marginTop: 4 }]}>{m(monthlyTotal)}</Text>
        <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 4 }}>{`About ${m(yearlyTotal)} a year across ${subscriptions.length} recurring charge${subscriptions.length === 1 ? '' : 's'}.`}</Text>
      </View>

      {subscriptions.length === 0 ? (
        <EmptyState
          icon="arrowUpDown"
          tone="#f472b6"
          title="No subscriptions detected"
          message="Keep logging expenses — once a charge repeats over a few months, SafeSpend spots it here automatically."
        />
      ) : (
        <>
          <SectionHeader title="Detected subscriptions" />
          <Card padded={false}>
            {subscriptions.map((s, i) => (
              <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 58, borderBottomWidth: i < subscriptions.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="arrowUpDown" size={16} color={c('primary')} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{s.name}</Text>
                    {s.priceHike ? <Badge variant="warning" icon="trendingUp">{`+${s.priceHike.pct}%`}</Badge> : null}
                  </View>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>
                    {s.source === 'recurring' ? 'Recurring rule'
                      : s.priceHike ? `Was ${m(s.priceHike.from)} · now ${m(s.priceHike.to)}`
                      : `Seen ${s.count}× · last ${ago(s.lastDate)}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[num(700), { fontSize: 15, color: c('fg') }]}>{m(s.amount)}<Text style={{ fontSize: 11, color: c('fgMuted') }}>/mo</Text></Text>
                  {s.source !== 'recurring' ? (
                    <Pressable onPress={() => trackAsRecurring(s)} hitSlop={6} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 9999, backgroundColor: c('primary', 0.12) }, pressed && { opacity: 0.7 }]}>
                      <Icon name="plus" size={11} color={c('primary')} stroke={2.4} />
                      <Text style={{ fontSize: 11, fontFamily: ff.semi, color: c('primary') }}>Track</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
          <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', lineHeight: 16, marginTop: 2 }}>
            Detected from repeating charges of a similar amount each month. Cancel any you don’t need to free up your Safe-to-Spend.
          </Text>
        </>
      )}
    </View>
  );
}
