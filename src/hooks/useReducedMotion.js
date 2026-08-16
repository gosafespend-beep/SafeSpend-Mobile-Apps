import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the OS "reduce motion" accessibility setting is on. Every motion
 * primitive consults this and degrades to a snap / cross-fade, so animation is
 * never forced on users who've opted out (accessibility + battery).
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return reduced;
}
