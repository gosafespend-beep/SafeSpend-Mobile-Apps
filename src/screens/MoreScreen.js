import React, { useState } from 'react';
import { View, Text, Pressable, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, alpha, num, shadow } from '../theme/tokens';
import { Badge, SectionHeader, Icon } from '../components';
import { money } from '../lib/format';
import { useSettings } from '../contexts/SettingsContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import { useRegion } from '../contexts/RegionContext';
import { useRefresh } from '../contexts/RefreshContext';
import { countryLabel } from '../lib/countries';
import CountrySheet from '../sheets/CountrySheet';
import ImportMessageSheet from '../sheets/ImportMessageSheet';
import { useProfileInfo } from '../hooks/useProfileInfo';
import { useAccounts } from '../hooks/useAccounts';
import { useNetWorth } from '../hooks/useNetWorth';
import { useBills } from '../hooks/useBills';
import { useDebts } from '../hooks/useDebts';
import { useGoals } from '../hooks/useGoals';

export default function MoreScreen({ onNavigate, onSignOut }) {
  const { settings } = useSettings();
  const { presentPaywall } = useEntitlement();
  const { country, setCountry, captureMethods } = useRegion();
  const { bump } = useRefresh();
  const [countryOpen, setCountryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { name, email, initials, avatarUrl, plan } = useProfileInfo();
  const { data: acctData } = useAccounts();
  // This row is labelled "Net worth", so it has to use the same figure the Net
  // worth screen shows. useAccounts().netWorth counts only accounts, excluding
  // manual assets/liabilities and tracked debts — with a tracked loan on file the
  // two screens disagreed by the whole loan balance.
  const { data: nwData } = useNetWorth();
  const { data: billData } = useBills();
  const { total: debtTotal, empty: noDebts } = useDebts();
  const { data: goalData } = useGoals();
  const m0 = (n) => money(n, { currency: settings.currency, cents: false });

  const accountCount = acctData?.accounts.length;
  const netWorthMeta = nwData ? m0(nwData.netWorth) : '';
  const upcomingCount = billData ? billData.bills.filter((b) => !b.paid).length : null;
  const goalCount = goalData?.goals.length;
  const isPremium = plan && plan !== 'Free';

  const sections = [
    {
      title: 'Financial tracking',
      rows: [
        { id: 'coach', label: 'AI money coach', icon: 'sparkles', iconColor: c('primary'), meta: 'Ask anything' },
        { id: 'accounts', label: 'Accounts', icon: 'wallet', iconColor: c('primary'), meta: accountCount != null ? `${accountCount} account${accountCount === 1 ? '' : 's'}` : '' },
        { id: 'bills', label: 'Bill calendar', icon: 'calendar', iconColor: c('warning'), meta: upcomingCount != null ? `${upcomingCount} upcoming` : '' },
        { id: 'debts', label: 'Debt tracker', icon: 'creditCard', iconColor: c('expense'), meta: noDebts ? '—' : m0(debtTotal) },
        { id: 'goals', label: 'Goals', icon: 'target', iconColor: c('income'), meta: goalCount != null ? `${goalCount} active` : '' },
        { id: 'recurring', label: 'Recurring', icon: 'arrowUpDown', iconColor: '#a78bfa' },
        { id: 'subscriptions', label: 'Subscriptions', icon: 'creditCard', iconColor: '#f472b6' },
        { id: 'annual', label: 'Annual budget', icon: 'barChart', iconColor: '#f59e0b' },
        { id: 'networth', label: 'Net worth', icon: 'trendingUp', iconColor: '#60a5fa', meta: netWorthMeta },
      ],
    },
    {
      title: 'Settings',
      rows: [
        { id: 'categories', label: 'Categories', icon: 'shopping', iconColor: c('fgMuted') },
        { id: 'preferences', label: 'Profile & settings', icon: 'userCircle', iconColor: c('fgMuted') },
        { id: 'notifs', label: 'Notifications', icon: 'bell', iconColor: c('fgMuted') },
      ],
    },
    { title: 'Subscription', rows: [{ id: 'paywall', label: 'Manage subscription', icon: 'sparkles', iconColor: c('savings'), meta: plan || '' }] },
  ];

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 8 }}>
      {/* Profile header */}
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c('primary', 0.2), padding: 18, marginBottom: 6, overflow: 'hidden' }}>
        <LinearGradient colors={[c('primary', 0.1), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c('primary'), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: 56, height: 56 }} />
            ) : (
              <Text style={{ fontFamily: ff.bold, fontSize: 20, color: '#fff' }}>{initials}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontFamily: ff.semi, color: c('fg') }}>{name}</Text>
            <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{email}</Text>
            {plan ? (
              <View style={{ marginTop: 6 }}>
                <Badge variant={isPremium ? 'primary' : 'default'} icon={isPremium ? 'sparkles' : undefined}>{plan}</Badge>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Region-aware ways to add money — available now vs coming soon for this market */}
      <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, overflow: 'hidden', ...shadow(1), marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>Ways to add money</Text>
          <Pressable onPress={() => setCountryOpen(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Change country or region">
            <Text style={{ fontSize: 12, color: c('primary'), fontFamily: ff.med }}>{`${countryLabel(country)}  ›`}</Text>
          </Pressable>
        </View>
        {captureMethods.map((m) => {
          const actionable = m.id === 'import_message';
          return (
            <Pressable
              key={m.id}
              onPress={actionable ? () => setImportOpen(true) : undefined}
              accessibilityRole={actionable ? 'button' : undefined}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c('border', 0.4) }, actionable && pressed && { backgroundColor: c('surfaceHover') }]}
            >
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c('primary', 0.12), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={m.icon} size={17} color={c('primary')} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{m.label}</Text>
                <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{m.blurb}</Text>
              </View>
              <Badge variant={m.status === 'available' ? 'income' : 'default'}>{m.status === 'available' ? 'On' : 'Soon'}</Badge>
              {actionable ? <Icon name="chevronRight" size={16} color={c('fgMuted')} /> : null}
            </Pressable>
          );
        })}
      </View>

      {sections.map((section) => (
        <View key={section.title}>
          <SectionHeader title={section.title} />
          <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, overflow: 'hidden', ...shadow(1) }}>
            {section.rows.map((row, i) => (
              <Pressable
                key={row.id}
                onPress={() => (row.id === 'paywall' ? presentPaywall('settings') : onNavigate && onNavigate(row.id))}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i < section.rows.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) },
                  pressed && { backgroundColor: c('surfaceHover') },
                ]}
              >
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: alpha(row.iconColor, 0.13), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={row.icon} size={18} color={row.iconColor} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{row.label}</Text>
                {row.meta ? <Text style={[num(400), { fontSize: 12, color: c('fgMuted') }]}>{row.meta}</Text> : null}
                <Icon name="chevronRight" size={16} color={c('fgMuted')} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Pressable
        onPress={() =>
          Alert.alert('Sign out?', 'You can sign back in anytime.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: onSignOut },
          ])
        }
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [{ marginTop: 12, padding: 14, borderWidth: 1, borderColor: c('border'), borderRadius: 11, alignItems: 'center' }, pressed && { opacity: 0.8 }]}
      >
        <Text style={{ color: c('expense'), fontFamily: ff.med, fontSize: 14 }}>Sign out</Text>
      </Pressable>

      <CountrySheet open={countryOpen} current={country} onSelect={setCountry} onClose={() => setCountryOpen(false)} />
      <ImportMessageSheet open={importOpen} onClose={() => setImportOpen(false)} onSaved={() => bump()} />
    </View>
  );
}
