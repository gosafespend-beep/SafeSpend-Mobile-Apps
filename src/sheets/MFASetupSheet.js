import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, ActivityIndicator } from 'react-native';
import { FormSheet } from '../components/FormSheet';
import { Button, Icon } from '../components';
import { c, ff, num } from '../theme/tokens';
import { useAuth } from '../contexts/AuthContext';

/** Enroll or remove TOTP two-factor auth. */
export default function MFASetupSheet({ open, onClose, onChanged, bottomInset = 0 }) {
  const { getMFAFactors, enrollMFA, challengeMFA, verifyMFA, unenrollMFA } = useAuth();
  const [factor, setFactor] = useState(null); // existing verified factor
  const [enroll, setEnroll] = useState(null); // { factorId, secret }
  const [challengeId, setChallengeId] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true); setErr(''); setCode(''); setEnroll(null); setFactor(null);
      const { data } = await getMFAFactors();
      const verified = data?.totp?.find((f) => f.status === 'verified');
      if (!active) return;
      if (verified) { setFactor(verified); setLoading(false); return; }
      const { data: en, error } = await enrollMFA();
      if (!active) return;
      if (error || !en) { setErr('Could not start setup.'); setLoading(false); return; }
      setEnroll({ factorId: en.id, secret: en.totp?.secret });
      const { data: ch } = await challengeMFA(en.id);
      if (active && ch) setChallengeId(ch.id);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const verify = async () => {
    if (code.length < 6 || !enroll || !challengeId) return;
    setBusy(true); setErr('');
    const { error } = await verifyMFA(enroll.factorId, challengeId, code);
    setBusy(false);
    if (error) { setErr('Incorrect code. Try again.'); setCode(''); return; }
    Alert.alert('Two-factor enabled', 'Your account is now protected with 2FA.');
    onChanged && onChanged();
    onClose && onClose();
  };

  const remove = () =>
    Alert.alert('Turn off 2FA?', 'Your account will no longer require a code to sign in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn off', style: 'destructive', onPress: async () => {
        const { error } = await unenrollMFA(factor.id);
        if (error) Alert.alert('Failed', error.message);
        else { onChanged && onChanged(); onClose && onClose(); }
      } },
    ]);

  return (
    <FormSheet open={open} onClose={onClose} title="Two-factor auth" onSave={factor ? remove : verify} saving={busy} saveLabel={factor ? 'Turn off 2FA' : 'Verify & enable'} saveVariant={factor ? 'destructive' : 'primary'} bottomInset={bottomInset}>
      {loading ? (
        <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
      ) : factor ? (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c('income', 0.16), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={26} color={c('income')} />
          </View>
          <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>Two-factor is on</Text>
          <Text style={{ fontSize: 12, color: c('fgMuted'), textAlign: 'center' }}>You'll enter a code from your authenticator app when signing in.</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: c('fgMuted'), lineHeight: 18 }}>1. Open your authenticator app (Google Authenticator, Authy…) and add a new account using this secret key:</Text>
          <View style={{ padding: 14, borderRadius: 12, backgroundColor: c('surfaceSecondary'), borderWidth: 1, borderColor: c('border') }}>
            <Text selectable style={[num(600), { fontSize: 15, letterSpacing: 1.5, color: c('fg'), textAlign: 'center' }]}>{enroll?.secret || '—'}</Text>
          </View>
          <Text style={{ fontSize: 13, color: c('fgMuted') }}>2. Enter the 6-digit code it shows:</Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={c('fgMuted')}
            keyboardType="number-pad"
            maxLength={6}
            style={[num(700), { height: 56, textAlign: 'center', fontSize: 26, letterSpacing: 8, color: c('fg'), backgroundColor: c('input'), borderWidth: 1, borderColor: err ? c('expense') : c('border'), borderRadius: 12 }]}
          />
          {err ? <Text style={{ color: c('expense'), fontSize: 13, fontFamily: ff.med }}>{err}</Text> : null}
        </>
      )}
    </FormSheet>
  );
}
