import React from 'react';
import { Image } from 'react-native';

/**
 * The mascot, per onboarding screen.
 *
 * Mirrors the web app's src/components/onboarding/scenes.tsx: same artwork,
 * same step-to-scene grouping, same rule about the reveal. Consecutive screens
 * about one subject share a picture deliberately — the illustration holds still
 * while the questions about it change, because swapping it every screen is
 * noise rather than richness.
 *
 * PNG rather than the WebP the web ships: React Native decodes WebP on Android
 * but not on iOS without an extra image library, and there is no expo-image
 * dependency here. A WebP set would have looked correct in review and rendered
 * nothing on every iPhone.
 *
 * require() paths must be static for Metro to bundle them, so this is a literal
 * map rather than a template string.
 */

const ART = {
  intro: require('../../assets/mascot/scene-shield.png'),
  currency: require('../../assets/mascot/scene-globe.png'),
  'account-type': require('../../assets/mascot/scene-wallet.png'),
  balance: require('../../assets/mascot/scene-wallet.png'),
  income: require('../../assets/mascot/scene-payslip.png'),
  'pay-frequency': require('../../assets/mascot/scene-payslip.png'),
  payday: require('../../assets/mascot/scene-calendar.png'),
  'bill-day': require('../../assets/mascot/scene-calendar.png'),
  'has-bill': require('../../assets/mascot/scene-receipt.png'),
  'bill-name': require('../../assets/mascot/scene-receipt.png'),
  'bill-amount': require('../../assets/mascot/scene-receipt.png'),
  overspend: require('../../assets/mascot/scene-categories.png'),
  'saving-for': require('../../assets/mascot/scene-jar.png'),
  'goal-detail': require('../../assets/mascot/scene-jar.png'),
  'has-debt': require('../../assets/mascot/scene-card.png'),
  'debt-detail': require('../../assets/mascot/scene-card.png'),
  building: require('../../assets/mascot/scene-shield.png'),
  alerts: require('../../assets/mascot/base.png'),
  'first-amount': require('../../assets/mascot/scene-coffee.png'),
  'first-what': require('../../assets/mascot/scene-coffee.png'),
  // 'reveal' is absent on purpose — it resolves through STATE below.
};

/**
 * The reveal, which is the one screen whose picture depends on the answer.
 *
 * scene-shield is the celebratory render: grinning, coins in orbit. Putting it
 * in front of someone who has just been told they cannot cover the month is the
 * exact failure this set exists to prevent. `steady` is present without either
 * celebrating or panicking, and it is slate rather than a muted amber so it
 * cannot be confused with `caution` at a glance.
 */
const STATE = {
  safe: require('../../assets/mascot/state-safe.png'),
  caution: require('../../assets/mascot/state-caution.png'),
  steady: require('../../assets/mascot/state-steady.png'),
};

export default function OnboardingScene({ stepId, variant = 'safe', height = 172 }) {
  const source = stepId === 'reveal' ? STATE[variant] || STATE.safe : ART[stepId];
  if (!source) return null;
  return (
    <Image
      source={source}
      resizeMode="contain"
      // Height-bounded rather than width-bounded: the renders came back at
      // whatever aspect the generator chose, and constraining width alone made
      // the portrait ones tower over the square ones between screens.
      style={{ height, width: '100%' }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
