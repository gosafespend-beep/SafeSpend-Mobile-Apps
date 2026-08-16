import React, { useState } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { c, ff, glow } from '../theme/tokens';
import { Input, Button, Icon } from '../components';
import { useAuth } from '../contexts/AuthContext';

/** Shown after a password-reset deep link opens the app (recovery session). */
export default function SetNewPasswordScreen({ topInset = 0 }) {
  const { updatePasswordFromReset, clearRecovery, signOut } = useAuth();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (next.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const { error: e } = await updatePasswordFromReset(next);
    setBusy(false);
    if (e) { setError(e.message); return; }
    clearRecovery();
    Alert.alert('Password updated', 'You can now use your new password.');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c('bg') }}>
      <View style={{ flex: 1, paddingTop: topInset + 60, paddingHorizontal: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={[{ width: 64, height: 64, borderRadius: 18, marginBottom: 16, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }, glow(c('primary'), 0.4)]}>
            <Icon name="shield" size={28} color={c('primary')} />
          </View>
          <Text style={{ fontSize: 22, fontFamily: ff.bold, color: c('fg'), letterSpacing: -0.3 }}>Set a new password</Text>
          <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 6, textAlign: 'center' }}>Choose a new password for your account.</Text>
        </View>

        <View style={{ gap: 14 }}>
          <Input label="New password" placeholder="At least 6 characters" value={next} onChange={setNext} secure />
          <Input label="Confirm password" placeholder="••••••••" value={confirm} onChange={setConfirm} secure />
          {error ? <Text style={{ color: c('expense'), fontSize: 13, fontFamily: ff.med }}>{error}</Text> : null}
          <Button block size="lg" icon="check" onPress={submit} disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
        </View>

        <View style={{ alignItems: 'center', marginTop: 22 }}>
          <Text onPress={signOut} style={{ color: c('fgMuted'), fontSize: 13, fontFamily: ff.med }}>Cancel and sign out</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
