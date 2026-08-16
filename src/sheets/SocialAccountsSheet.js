import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { FormSheet } from '../components/FormSheet';
import { Icon } from '../components';
import { c, ff } from '../theme/tokens';
import { useAuth } from '../contexts/AuthContext';

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: 'userCircle' },
];

export default function SocialAccountsSheet({ open, onClose, bottomInset = 0 }) {
  const { getIdentities, linkGoogle, unlinkIdentity } = useAuth();
  const [identities, setIdentities] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await getIdentities();
    setIdentities(data || []);
  }, [getIdentities]);

  useEffect(() => { if (open) { setIdentities(null); load(); } }, [open, load]);

  const linkedFor = (prov) => identities?.find((i) => i.provider === prov);
  const hasEmail = !!linkedFor('email');
  const linkedCount = (identities || []).length;

  const onLink = async () => {
    setBusy(true);
    const { error } = await linkGoogle();
    setBusy(false);
    if (error) Alert.alert('Could not link Google', error.message);
    else load();
  };

  const onUnlink = (identity) => {
    if (linkedCount <= 1) {
      Alert.alert('Cannot unlink', 'You must keep at least one sign-in method.');
      return;
    }
    Alert.alert('Unlink Google?', 'You will no longer be able to sign in with Google.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink', style: 'destructive', onPress: async () => {
          setBusy(true);
          const { error } = await unlinkIdentity(identity);
          setBusy(false);
          if (error) Alert.alert('Could not unlink', error.message);
          else load();
        },
      },
    ]);
  };

  return (
    <FormSheet open={open} onClose={onClose} title="Connected accounts" onSave={onClose} saving={busy} saveLabel="Done" bottomInset={bottomInset}>
      {identities == null ? (
        <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
      ) : (
        <>
          {hasEmail ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="shield" size={18} color={c('fg')} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>Email & password</Text>
                <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>Connected</Text>
              </View>
              <Icon name="check" size={18} color={c('income')} />
            </View>
          ) : null}

          {PROVIDERS.map((p) => {
            const linked = linkedFor(p.id);
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c('border', 0.4) }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={p.icon} size={18} color={c('fg')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{p.label}</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{linked ? 'Connected' : 'Not connected'}</Text>
                </View>
                {linked ? (
                  <Pressable onPress={() => onUnlink(linked)} disabled={busy} hitSlop={8}>
                    <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('expense') }}>Unlink</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={onLink} disabled={busy} hitSlop={8}>
                    <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('primary') }}>Connect</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 4, lineHeight: 16 }}>
            Link Google to sign in faster. You must always keep at least one sign-in method.
          </Text>
        </>
      )}
    </FormSheet>
  );
}
