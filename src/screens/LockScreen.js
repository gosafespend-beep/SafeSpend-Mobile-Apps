import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { c, ff, glow } from '../theme/tokens';
import { Button, Icon } from '../components';
import { useAppLock, BIOMETRIC_LABEL } from '../contexts/AppLockContext';

/** Full-screen biometric gate shown when app-lock is enabled and the app is locked. */
export default function LockScreen({ topInset = 0 }) {
  const { unlock } = useAppLock();
  const [tried, setTried] = useState(false);

  useEffect(() => {
    // Prompt immediately on appear.
    (async () => { await unlock(); setTried(true); })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: c('bg'), alignItems: 'center', justifyContent: 'center', paddingTop: topInset, paddingHorizontal: 32 }}>
      <View style={[{ width: 80, height: 80, borderRadius: 24, marginBottom: 20, backgroundColor: c('primary', 0.16), alignItems: 'center', justifyContent: 'center' }, glow(c('primary'), 0.4)]}>
        <Icon name="shield" size={36} color={c('primary')} />
      </View>
      <Text style={{ fontSize: 22, fontFamily: ff.bold, color: c('fg'), letterSpacing: -0.3 }}>Safe Spend is locked</Text>
      <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 6, textAlign: 'center' }}>
        Unlock with your {BIOMETRIC_LABEL} to continue.
      </Text>
      {tried ? (
        <View style={{ marginTop: 24, alignSelf: 'stretch' }}>
          <Button block size="lg" icon="shield" onPress={unlock}>Unlock</Button>
        </View>
      ) : null}
    </View>
  );
}
