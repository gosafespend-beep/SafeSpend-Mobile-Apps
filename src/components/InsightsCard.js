import React from 'react';
import { View, Text } from 'react-native';
import { c, ff } from '../theme/tokens';
import { Icon } from './index';

const TONE = {
  warning: { color: 'warning', icon: 'alertTriangle' },
  success: { color: 'income', icon: 'check' },
  info: { color: 'primary', icon: 'sparkles' },
  tip: { color: 'savings', icon: 'sparkles' },
};

/** Compact list of generated money insights, shown on the dashboard. */
export function InsightsCard({ insights = [] }) {
  if (!insights.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {insights.map((it, i) => {
        const t = TONE[it.type] || TONE.info;
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c(t.color, 0.08), borderWidth: 1, borderColor: c(t.color, 0.2) }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c(t.color, 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={t.icon} size={15} color={c(t.color)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>{it.title}</Text>
              <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2, lineHeight: 16 }}>{it.message}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
