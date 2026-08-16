import React, { useState } from 'react';
import { View, Text, Pressable, Modal, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { c, ff, num, glow, alpha } from '../theme/tokens';
import { Icon, Button } from './index';

const SLIDES = [
  { icon: 'shield', title: 'Welcome to SafeSpend', body: 'Your whole financial life in one private place. Here’s a 30-second tour of what you can do.' },
  { icon: 'wallet', title: 'Know what’s Safe to Spend', body: 'Your dashboard shows one clear number — what you can spend now after upcoming bills and savings goals are covered.' },
  { icon: 'scale', title: 'Budget with confidence', body: 'Set monthly limits per category and watch the annual view. SafeSpend warns you before you overspend.' },
  { icon: 'plus', title: 'Log money in seconds', body: 'Tap the + button to add income or an expense. Add accounts, goals, debts and bills from the More tab.' },
  { icon: 'barChart', title: 'See where it goes', body: 'Reports, trends, needs-vs-wants and a 6-month forecast turn your numbers into clear insights.' },
];

export default function ProductTour({ open, onClose }) {
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (last) finish();
    else setI((n) => n + 1);
  };
  const finish = () => { setI(0); onClose && onClose(); };

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={finish}>
      <View style={{ flex: 1, backgroundColor: c('bg') }}>
        <LinearGradient colors={[alpha(c('primary'), 0.16), 'transparent']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }} />

        {/* Skip */}
        <View style={{ paddingTop: 54, paddingHorizontal: 20, alignItems: 'flex-end' }}>
          {!last ? (
            <Pressable onPress={finish} hitSlop={10}><Text style={{ fontSize: 14, color: c('fgMuted'), fontFamily: ff.med }}>Skip</Text></Pressable>
          ) : null}
        </View>

        {/* Content */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 22 }}>
          <View style={[{ width: 96, height: 96, borderRadius: 30, backgroundColor: c('primary'), alignItems: 'center', justifyContent: 'center' }, glow(c('primary'), 0.55)]}>
            <Icon name={slide.icon} size={44} color="#fff" />
          </View>
          <Text style={[num(700), { fontSize: 24, color: c('fg'), textAlign: 'center', letterSpacing: -0.3 }]}>{slide.title}</Text>
          <Text style={{ fontSize: 15, lineHeight: 23, color: c('fgMuted'), textAlign: 'center' }}>{slide.body}</Text>
        </View>

        {/* Dots + action */}
        <View style={{ paddingHorizontal: 28, paddingBottom: 44, gap: 22 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
            {SLIDES.map((_, idx) => (
              <View key={idx} style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 9999, backgroundColor: idx === i ? c('primary') : c('surfaceSecondary') }} />
            ))}
          </View>
          <Button block size="lg" icon={last ? 'check' : undefined} onPress={next}>
            {last ? 'Get started' : 'Next'}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
