import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { c, ff } from '../theme/tokens';
import { Icon } from './index';
import { usePeriod } from '../contexts/PeriodContext';

const MODES = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

/** Month/Year/All-time switch with prev/next, shown atop period-aware screens. */
export function PeriodSelector() {
  const { mode, setMode, label, prev, next, canGoNext } = usePeriod();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {mode !== 'all' ? (
          <Pressable onPress={prev} hitSlop={10} accessibilityLabel="Previous period" style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevronLeft" size={16} color={c('fg')} />
          </Pressable>
        ) : <View style={{ width: 30 }} />}
        <View style={{ minWidth: 150, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 9999, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border') }}>
          <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{label}</Text>
        </View>
        {mode !== 'all' ? (
          <Pressable onPress={next} hitSlop={10} disabled={!canGoNext} accessibilityLabel="Next period" style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center', opacity: canGoNext ? 1 : 0.4 }}>
            <Icon name="chevronRight" size={16} color={c('fg')} />
          </Pressable>
        ) : <View style={{ width: 30 }} />}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: c('surfaceSecondary'), borderRadius: 10, alignSelf: 'center' }}>
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <Pressable key={m.value} onPress={() => setMode(m.value)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${m.label} view`} style={{ paddingVertical: 5, paddingHorizontal: 16, borderRadius: 8, backgroundColor: active ? c('surface') : 'transparent' }}>
              <Text style={{ fontSize: 12, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
