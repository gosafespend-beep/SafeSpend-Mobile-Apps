import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import { motion } from '../theme/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * A number that rolls from its previous value to the new one. `format` turns the
 * interpolated float into the display string (e.g. money()). Snaps instantly when
 * reduce-motion is on. By default counts up from 0 on first mount.
 */
export function AnimatedNumber({ value = 0, format = (n) => String(Math.round(n)), duration = motion.duration.slow, animateOnMount = true, style, ...rest }) {
  const reduced = useReducedMotion();
  const start = animateOnMount ? 0 : value;
  const anim = useRef(new Animated.Value(start)).current;
  const [display, setDisplay] = useState(() => format(start));

  // The rendered string depends on more than `value`: `format` closes over the
  // display currency and the "Hide amounts" flag. Keying the effect on `value`
  // alone meant a formatter change never re-ran it, so the cached string stayed —
  // turning on Hide amounts left the Safe-to-Spend hero and stat cards showing
  // real balances while everything else masked. Comparing the formatted OUTPUT
  // (a string, compared by value) re-syncs on those changes without re-running
  // on every render.
  const formatted = format(value);

  useEffect(() => {
    if (reduced) { anim.setValue(value); setDisplay(formatted); return undefined; }
    const id = anim.addListener(({ value: v }) => setDisplay(format(v)));
    const sub = Animated.timing(anim, { toValue: value, duration, easing: motion.easing.decelerate, useNativeDriver: false });
    sub.start();
    return () => { anim.removeListener(id); sub.stop && sub.stop(); };
  }, [value, reduced, formatted]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Text style={style} {...rest}>{display}</Text>;
}

/**
 * Drives a 0→value fill (progress bars, rings, donuts). Returns an Animated.Value
 * the caller interpolates. Snaps under reduce-motion.
 */
export function useAnimatedProgress(value, { duration = motion.duration.slow, animateOnMount = true } = {}) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(animateOnMount ? 0 : value)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(value); return undefined; }
    const a = Animated.timing(anim, { toValue: value, duration, easing: motion.easing.decelerate, useNativeDriver: false });
    a.start();
    return () => a.stop && a.stop();
  }, [value, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return anim;
}

/**
 * Mount reveal: fade + slide-up. Pass `delay` to stagger a list. Native-driven
 * (opacity + transform), so it stays on the UI thread.
 */
export function Reveal({ children, delay = 0, y = 8, duration = motion.duration.base, style }) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(1); return undefined; }
    const a = Animated.timing(anim, { toValue: 1, duration, delay, easing: motion.easing.decelerate, useNativeDriver: true });
    a.start();
    return () => a.stop && a.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * Returns a scale Animated.Value that gives a quick pulse whenever `dep` changes
 * (e.g. a number updated after a save). Skips the first render. Wrap the target
 * in Animated.View with transform:[{scale}]. Native-driven.
 */
export function usePulse(dep, { skipFirst = true } = {}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; if (skipFirst) return undefined; }
    if (reduced) return undefined;
    const a = Animated.sequence([
      Animated.timing(scale, { toValue: 1.06, duration: 110, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, ...motion.springBouncy, useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop && a.stop();
  }, [dep]); // eslint-disable-line react-hooks/exhaustive-deps
  return scale;
}
