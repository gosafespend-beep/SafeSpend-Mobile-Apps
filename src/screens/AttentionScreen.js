import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { c, ff, alpha } from '../theme/tokens';
import { Icon } from '../components';
import { EmptyState } from '../components/EmptyState';
import { useAttention } from '../contexts/AttentionContext';

/** "Needs attention" feed — overdue bills, over-budget, goal deadlines, email. */
export default function AttentionScreen({ onNavigate }) {
  const { items } = useAttention();

  if (!items.length) {
    return (
      <EmptyState
        icon="check"
        tone={c('income')}
        title="All caught up"
        message="No overdue bills, budget overruns or deadlines right now. Nice and tidy."
      />
    );
  }

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 10 }}>
      <Text style={{ fontSize: 12, color: c('fgMuted'), paddingHorizontal: 2 }}>
        {`${items.length} thing${items.length === 1 ? '' : 's'} to look at`}
      </Text>
      {items.map((it) => {
        const tone = c(it.tone);
        return (
          <Pressable
            key={it.id}
            onPress={() => it.nav && onNavigate && onNavigate(it.nav)}
            accessibilityRole="button"
            accessibilityLabel={it.title}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: c('surface'), borderWidth: 1, borderColor: alpha(tone, 0.3) }, pressed && { backgroundColor: c('surfaceHover') }]}
          >
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: alpha(tone, 0.14), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={it.icon} size={18} color={tone} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{it.title}</Text>
              <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{it.subtitle}</Text>
            </View>
            <Icon name="chevronRight" size={16} color={c('fgMuted')} />
          </Pressable>
        );
      })}
    </View>
  );
}
