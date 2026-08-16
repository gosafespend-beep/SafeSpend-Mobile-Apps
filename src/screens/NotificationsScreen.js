import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { c, ff } from '../theme/tokens';
import { Card, SectionHeader, Toggle } from '../components';
import { useNotificationPrefs } from '../hooks/useNotificationPrefs';
import { useAuth } from '../contexts/AuthContext';
import { syncNotifications } from '../lib/notifications';

// Each section maps to one real notification_preferences column.
const SECTIONS = [
  { title: 'Bills', rows: [{ id: 'bill_reminders', label: 'Bill reminders', hint: 'Before a bill is due' }] },
  { title: 'Budgets', rows: [{ id: 'budget_alerts', label: 'Budget alerts', hint: 'When you approach or exceed a category limit' }] },
  { title: 'Insights', rows: [{ id: 'weekly_summary', label: 'Weekly summary', hint: 'Your week in numbers' }] },
  { title: 'Email', rows: [{ id: 'marketing_emails', label: 'Product & marketing emails', hint: 'News, tips and offers' }] },
];

export default function NotificationsScreen() {
  const { prefs, loading, toggle } = useNotificationPrefs();
  const { user } = useAuth();

  const onToggle = async (id) => {
    await toggle(id);
    // Bill + weekly scheduling both flow through syncNotifications.
    if ((id === 'bill_reminders' || id === 'weekly_summary') && user) syncNotifications(user.id).catch(() => {});
  };

  if (loading) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>;
  }

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 8 }}>
      {SECTIONS.map((section) => (
        <View key={section.title}>
          <SectionHeader title={section.title} />
          <Card padded={false}>
            {section.rows.map((row, i) => (
              <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 60, borderBottomWidth: i < section.rows.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{row.label}</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{row.hint}</Text>
                </View>
                <Toggle on={prefs[row.id]} onPress={() => onToggle(row.id)} />
              </View>
            ))}
          </Card>
        </View>
      ))}
      <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', marginTop: 8, lineHeight: 16 }}>
        Changes save automatically and sync with the web app.
      </Text>
    </View>
  );
}
