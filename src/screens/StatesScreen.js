import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { c, ff } from '../theme/tokens';
import { Card, SectionHeader, Button, Icon } from '../components';

function Skel({ w, h, round = 6, style }) {
  const op = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View style={[{ width: w, height: h, borderRadius: round, backgroundColor: c('surfaceMuted'), opacity: op }, style]} />;
}

export default function StatesScreen() {
  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 16 }}>
      {/* Loading */}
      <View>
        <SectionHeader title="Loading" />
        <Card>
          <View style={{ gap: 14, paddingVertical: 4 }}>
            <Skel w="60%" h={14} />
            <Skel w="40%" h={20} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Skel w="33%" h={56} round={11} style={{ flex: 1 }} />
              <Skel w="33%" h={56} round={11} style={{ flex: 1 }} />
              <Skel w="33%" h={56} round={11} style={{ flex: 1 }} />
            </View>
            <View style={{ gap: 10, marginTop: 6 }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Skel w={36} h={36} round={10} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skel w="70%" h={12} />
                    <Skel w="40%" h={10} />
                  </View>
                  <Skel w={60} h={14} />
                </View>
              ))}
            </View>
          </View>
        </Card>
      </View>

      {/* Empty — no transactions */}
      <View>
        <SectionHeader title="Empty · no transactions yet" />
        <Card>
          <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, marginBottom: 14, backgroundColor: c('primary', 0.14), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="receipt" size={26} color={c('primary')} />
            </View>
            <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>No transactions yet</Text>
            <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 6, lineHeight: 18, textAlign: 'center', maxWidth: 260 }}>Add your first transaction to start seeing your spending patterns.</Text>
            <View style={{ marginTop: 16 }}>
              <Button icon="plus">Add transaction</Button>
            </View>
          </View>
        </Card>
      </View>

      {/* Empty — no goals */}
      <View>
        <SectionHeader title="Empty · no goals" />
        <Card>
          <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, marginBottom: 14, backgroundColor: c('income', 0.16), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="target" size={26} color={c('income')} />
            </View>
            <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>Set your first goal</Text>
            <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 6, lineHeight: 18, textAlign: 'center', maxWidth: 260 }}>Saving for an emergency fund, a trip, or a big purchase? We'll help you track it.</Text>
            <View style={{ marginTop: 16 }}>
              <Button icon="plus">Create a goal</Button>
            </View>
          </View>
        </Card>
      </View>

      {/* Error */}
      <View>
        <SectionHeader title="Error · sync failed" />
        <Card>
          <View style={{ paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, marginBottom: 12, backgroundColor: c('expense', 0.14), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="alertTriangle" size={24} color={c('expense')} />
            </View>
            <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>Couldn't sync</Text>
            <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 4, lineHeight: 18, textAlign: 'center', maxWidth: 260 }}>Check your connection. Your last 8 changes are saved locally and will sync when you're back.</Text>
            <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
              <Button size="sm" variant="outline">Retry</Button>
              <Button size="sm" variant="ghost">Details</Button>
            </View>
          </View>
        </Card>
      </View>

      {/* Offline banner */}
      <View>
        <SectionHeader title="Offline banner" />
        <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 11, backgroundColor: c('warning', 0.14), borderWidth: 1, borderColor: c('warning', 0.3), flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="alertTriangle" size={16} color={c('warning')} />
          <Text style={{ flex: 1, fontSize: 12, color: c('fg') }}>You're offline. Changes will sync when you're back.</Text>
        </View>
      </View>

      {/* Success toast */}
      <View>
        <SectionHeader title="Success toast" />
        <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 11, backgroundColor: c('surfaceElevated'), borderWidth: 1, borderColor: c('income', 0.3), flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c('income', 0.22), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={16} color={c('income')} stroke={2.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>Saved</Text>
            <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>$84.20 expense · Groceries</Text>
          </View>
          <Text style={{ fontSize: 12, fontFamily: ff.semi, color: c('primary') }}>Undo</Text>
        </View>
      </View>
    </View>
  );
}
