import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { c, ff, num, glow } from '../theme/tokens';
import { Button, Icon } from '../components';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shown after password sign-in when the account has MFA enrolled (aal1 → aal2).
 * Without this, a user who enabled 2FA on the web could sign in on mobile with
 * just a password. RootNavigator renders this before the app when mfaRequired.
 */
export default function MFAScreen({ topInset = 0 }) {
  const { getMFAFactors, challengeMFA, verifyMFA, setMfaVerified, signOut } = useAuth();
  const [factorId, setFactorId] = useState(null);
  const [challengeId, setChallengeId] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const startChallenge = async () => {
    setLoading(true);
    setError('');
    const { data, error: fErr } = await getMFAFactors();
    const factor = data?.totp?.find((f) => f.status === 'verified') || data?.totp?.[0];
    if (fErr || !factor) { setError('No authenticator found for this account.'); setLoading(false); return; }
    setFactorId(factor.id);
    const { data: ch, error: cErr } = await challengeMFA(factor.id);
    if (cErr || !ch) { setError('Could not start verification. Try again.'); setLoading(false); return; }
    setChallengeId(ch.id);
    setLoading(false);
  };

  useEffect(() => { startChallenge(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (code.length < 6 || !factorId || !challengeId) return;
    setVerifying(true);
    setError('');
    const { error: vErr } = await verifyMFA(factorId, challengeId, code);
    setVerifying(false);
    if (vErr) {
      setError('Incorrect code. Please try again.');
      setCode('');
      startChallenge();
      return;
    }
    setMfaVerified();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c('bg'), paddingTop: topInset + 60, paddingHorizontal: 24 }}>
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <View style={[{ width: 64, height: 64, borderRadius: 18, marginBottom: 16, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }, glow(c('primary'), 0.4)]}>
          <Icon name="shield" size={28} color={c('primary')} />
        </View>
        <Text style={{ fontSize: 22, fontFamily: ff.bold, color: c('fg'), letterSpacing: -0.3 }}>Two-factor verification</Text>
        <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 6, textAlign: 'center', lineHeight: 19 }}>Enter the 6-digit code from your authenticator app.</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={c('primary')} />
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={c('fgMuted')}
            keyboardType="number-pad"
            autoFocus
            maxLength={6}
            style={[num(700), { height: 64, textAlign: 'center', fontSize: 30, letterSpacing: 10, color: c('fg'), backgroundColor: c('input'), borderWidth: 1, borderColor: error ? c('expense') : c('border'), borderRadius: 14 }]}
          />
          {error ? <Text style={{ color: c('expense'), fontSize: 13, fontFamily: ff.med, marginTop: 10, textAlign: 'center' }}>{error}</Text> : null}
          <View style={{ marginTop: 18 }}>
            <Button block size="lg" icon="check" onPress={submit} disabled={verifying || code.length < 6}>
              {verifying ? 'Verifying…' : 'Verify'}
            </Button>
          </View>
        </>
      )}

      <Pressable onPress={signOut} style={{ marginTop: 22, alignItems: 'center' }}>
        <Text style={{ color: c('fgMuted'), fontSize: 13, fontFamily: ff.med }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
