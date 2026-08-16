import React, { useEffect, useState } from 'react';
import { View, Animated, useWindowDimensions, Easing } from 'react-native';
import { c } from '../theme/tokens';

/**
 * One-shot confetti burst. Bump `trigger` (e.g. a counter) to fire it — a
 * short, celebratory rain of pieces that cleans itself up. pointerEvents=none
 * so it never blocks taps.
 */
export default function Confetti({ trigger }) {
  const { width, height } = useWindowDimensions();
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!trigger) return;
    // Evaluated per-burst (not a module-level const) so a live theme switch
    // (light/dark) is reflected the next time confetti fires.
    const COLORS = [c('primary'), c('income'), c('savings'), c('warning'), '#a78bfa', '#60a5fa'];
    const arr = Array.from({ length: 26 }).map((_, i) => ({
      id: `${trigger}-${i}`,
      x: Math.random() * width,
      drift: (Math.random() - 0.5) * 90,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 6,
      rot: Math.random() * 360,
      anim: new Animated.Value(0),
    }));
    setPieces(arr);
    Animated.parallel(
      arr.map((p) =>
        Animated.timing(p.anim, {
          toValue: 1,
          duration: 1300 + Math.random() * 600,
          delay: Math.random() * 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      )
    ).start(() => setPieces([]));
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pieces.length) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 80 }}>
      {pieces.map((p) => (
        <Animated.View
          key={p.id}
          style={{
            position: 'absolute', left: p.x, top: -24, width: p.size, height: p.size * 1.6, borderRadius: 2, backgroundColor: p.color,
            opacity: p.anim.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
              { translateX: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.anim.interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}deg`, `${p.rot + 320}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
