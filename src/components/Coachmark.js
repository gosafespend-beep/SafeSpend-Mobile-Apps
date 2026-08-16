import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { c, ff, glow } from '../theme/tokens';

/**
 * A one-shot "show, don't tell" tooltip anchored above the FAB. Replaces a wall
 * of tour slides with a single contextual nudge pointing at the real control.
 * A light scrim makes it pop; tapping anywhere dismisses.
 */
export default function Coachmark({ visible, text, onDismiss, bottom = 160 }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }).start();
    }
  }, [visible, anim]);

  if (!visible) return null;

  return (
    <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss tip" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 40 }]}>
      <Animated.View
        style={{
          position: 'absolute',
          right: 14,
          bottom,
          alignItems: 'flex-end',
          maxWidth: 250,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        }}
      >
        <View style={[{ backgroundColor: c('primary'), paddingVertical: 12, paddingHorizontal: 14, borderRadius: 13 }, glow(c('primary'), 0.4)]}>
          <Text style={{ color: '#fff', fontSize: 14, fontFamily: ff.semi, lineHeight: 19 }}>{text}</Text>
          <Text style={{ color: '#fff', opacity: 0.75, fontSize: 11, marginTop: 6 }}>Tap anywhere to dismiss</Text>
        </View>
        {/* Arrow pointing down toward the FAB (which sits at the bottom-right). */}
        <View style={{ width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 9, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: c('primary'), marginRight: 20 }} />
      </Animated.View>
    </Pressable>
  );
}
