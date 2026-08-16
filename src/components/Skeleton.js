import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { c, R as radius } from '../theme/tokens';

/** A single pulsing placeholder block. */
export function Skeleton({ width = '100%', height = 16, style, br = 8 }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: br, backgroundColor: c('surfaceSecondary'), opacity }, style]} />;
}

function CardBlock({ height = 90 }) {
  return (
    <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: radius.lg, padding: 16, gap: 10 }}>
      <Skeleton width="40%" height={12} />
      <Skeleton width="70%" height={22} />
      <Skeleton width="100%" height={height - 60} />
    </View>
  );
}

/** Full-screen loading placeholder for the main data screens. */
export function ScreenSkeleton({ rows = 3 }) {
  return (
    <View style={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><CardBlock height={86} /></View>
        <View style={{ flex: 1 }}><CardBlock height={86} /></View>
      </View>
      <CardBlock height={120} />
      <View style={{ gap: 10 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: radius.lg }}>
            <Skeleton width={40} height={40} br={11} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="35%" height={11} />
            </View>
            <Skeleton width={60} height={16} />
          </View>
        ))}
      </View>
    </View>
  );
}
