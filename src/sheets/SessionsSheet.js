import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { c, ff, shadow } from '../theme/tokens';
import { Icon, Badge } from '../components';
import { useSessions } from '../hooks/useSessions';

function deviceIcon(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('mobile')) return 'wallet';
  if (t.includes('tablet')) return 'scale';
  return 'home';
}

/** Active devices/sessions with the ability to sign each one out remotely. */
export default function SessionsSheet({ open, onClose }) {
  const { sessions, loading, error, reload, revoke } = useSessions(open);

  const confirmRevoke = (s) =>
    Alert.alert('Sign out this device?', s.device, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        const res = await revoke(s.id);
        if (!res.ok) Alert.alert('Could not revoke', res.error || 'Try again later.');
      } },
    ]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: c('bg') }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 }}>
          <Text style={{ fontSize: 20, fontFamily: ff.bold, color: c('fg') }}>Active sessions</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={18} color={c('fgMuted')} />
          </Pressable>
        </View>
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
        ) : error ? (
          <View style={{ padding: 30, alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center' }}>{error}</Text>
            <Pressable onPress={reload}><Text style={{ color: c('primary'), fontFamily: ff.med }}>Retry</Text></Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
            {sessions.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 14, ...shadow(1) }}>
                <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: c('primary', 0.15), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={deviceIcon(s.device_type)} size={18} color={c('primary')} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{s.device}</Text>
                    {s.is_current ? <Badge variant="income">This device</Badge> : null}
                  </View>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{s.ip}</Text>
                </View>
                {!s.is_current ? (
                  <Pressable onPress={() => confirmRevoke(s)} hitSlop={6}><Text style={{ fontSize: 12, color: c('expense'), fontFamily: ff.med }}>Sign out</Text></Pressable>
                ) : null}
              </View>
            ))}
            {sessions.length === 0 ? <Text style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center', padding: 20 }}>No other active sessions.</Text> : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
