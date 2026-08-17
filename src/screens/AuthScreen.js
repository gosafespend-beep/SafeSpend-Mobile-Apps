import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import { c, ff, glow, currentThemeMode } from '../theme/tokens';
import { Input, Button, Icon } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../lib/analytics';

const logo = require('../../assets/logo-shield.png');
const TERMS_URL = 'https://gosafespend.com/terms-of-service';
const PRIVACY_URL = 'https://gosafespend.com/privacy-policy';

// Official 4-colour Google mark — renders correctly on any background (light or dark).
function GoogleMark() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

const MIN_PASSWORD = 8;

/** Rough, honest strength read — length first, then variety. */
function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', tone: null };
  let score = 0;
  if (pw.length >= MIN_PASSWORD) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length < MIN_PASSWORD) return { score: 1, label: `At least ${MIN_PASSWORD} characters`, tone: 'expense' };
  if (score <= 2) return { score: 2, label: 'Weak', tone: 'expense' };
  if (score === 3) return { score: 3, label: 'Fair', tone: 'warning' };
  if (score === 4) return { score: 4, label: 'Good', tone: 'income' };
  return { score: 5, label: 'Strong', tone: 'income' };
}

// Supabase surfaces developer-facing strings; these are the ones users actually
// hit. Anything unmapped falls through unchanged rather than being swallowed.
function friendlyError(msg = '') {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email or password doesn’t match an account.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox for the link.';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try signing in instead.';
  if (m.includes('password should be at least')) return `Please use at least ${MIN_PASSWORD} characters.`;
  if (m.includes('unable to validate email') || m.includes('invalid format')) return 'That email address doesn’t look right.';
  if (m.includes('rate limit') || m.includes('too many requests')) return 'Too many attempts — please wait a moment and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Can’t reach the server. Check your connection and try again.';
  return msg;
}

export default function AuthScreen({ topInset = 0, initialMode = 'signin', onBackToWelcome }) {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogle, signInWithApple, resetPassword } = useAuth();
  const [mode, setMode] = useState(initialMode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const strength = passwordStrength(password);

  const handleEmail = async () => {
    setError(''); setNotice('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    // Enforced on sign-up only — existing accounts may predate this minimum and
    // must still be able to sign in.
    if (mode === 'signup' && password.length < MIN_PASSWORD) {
      setError(`Please use a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    if (mode === 'signin') {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(friendlyError(error.message));
      else track('signin', { method: 'email' });
      // success: RootNavigator's session gate advances automatically.
    } else {
      // One name field is friendlier than two at the highest-drop-off moment; the
      // first token is the given name, the rest (if any) the family name.
      const parts = fullName.trim().split(/\s+/).filter(Boolean);
      const { error } = await signUp(email.trim(), password, parts[0] || '', parts.slice(1).join(' '));
      if (error) setError(friendlyError(error.message));
      else {
        track('signup', { method: 'email' });
        // Inline, not an Alert: if email confirmation is required there's no session
        // yet, so the user stays on this screen and needs the message to persist.
        setNotice('Check your inbox — we sent a link to confirm your email.');
      }
    }
    setBusy(false);
  };

  const handleGoogle = async () => {
    setError(''); setNotice('');
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) setError(friendlyError(error.message));
    else track('signin', { method: 'google' });
    setBusy(false);
  };

  const handleApple = async () => {
    setError(''); setNotice('');
    setBusy(true);
    const { error } = await signInWithApple();
    if (error) setError(friendlyError(error.message));
    else track('signin', { method: 'apple' });
    setBusy(false);
  };

  const handleForgot = async () => {
    setError(''); setNotice('');
    if (!email.trim()) {
      setError('Enter your email first, then tap “Forgot password”.');
      return;
    }
    const { error } = await resetPassword(email.trim());
    if (error) setError(friendlyError(error.message));
    else setNotice('Password reset sent — check your email for the link.');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c('bg') }} contentContainerStyle={{ paddingTop: topInset + 50, paddingHorizontal: 24, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      {/* Logo + title */}
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <View style={[{ width: 72, height: 72, borderRadius: 18, overflow: 'hidden', marginBottom: 16 }, glow(c('primary'), 0.45)]}>
          <Image source={logo} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
        <Text style={{ fontSize: 24, fontFamily: ff.bold, letterSpacing: -0.36, color: c('fg') }}>Safe Spend</Text>
        <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 4 }}>Smart budgeting that respects your privacy</Text>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c('surfaceSecondary'), borderRadius: 11, marginBottom: 18 }}>
        {['signin', 'signup'].map((m) => {
          const active = mode === m;
          return (
            <Pressable key={m} onPress={() => setMode(m)} style={[{ flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, active && { backgroundColor: c('surface') }]}>
              <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{m === 'signin' ? 'Sign In' : 'Sign Up'}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Form */}
      <View style={{ gap: 14 }}>
        {mode === 'signup' ? (
          <Input label="Your name" placeholder="Alex Kimani" value={fullName} onChange={setFullName} />
        ) : null}
        <Input label="Email" placeholder="you@example.com" value={email} onChange={setEmail} keyboardType="email-address" />
        <Input label="Password" placeholder="••••••••" value={password} onChange={setPassword} secure />
        {mode === 'signup' && password ? (
          <View style={{ marginTop: -6, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={{
                    flex: 1, height: 3, borderRadius: 9999,
                    backgroundColor: i <= strength.score && strength.tone ? c(strength.tone) : c('surfaceSecondary'),
                  }}
                />
              ))}
            </View>
            {strength.label ? (
              <Text style={{ fontSize: 11, fontFamily: ff.med, color: strength.tone ? c(strength.tone) : c('fgMuted') }}>{strength.label}</Text>
            ) : null}
          </View>
        ) : null}
        {mode === 'signin' ? (
          <Pressable style={{ alignSelf: 'flex-end' }} onPress={handleForgot}>
            <Text style={{ color: c('primary'), fontSize: 13, fontFamily: ff.med }}>Forgot password?</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={{ color: c('expense'), fontSize: 13, fontFamily: ff.med }}>{error}</Text> : null}
        {notice ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 11, borderWidth: 1, borderColor: c('income', 0.4), backgroundColor: c('income', 0.08) }}>
            <Icon name="mail" size={16} color={c('income')} />
            <Text style={{ flex: 1, fontSize: 12.5, color: c('fg'), lineHeight: 18 }}>{notice}</Text>
          </View>
        ) : null}
        <Button block size="lg" icon={mode === 'signin' ? 'shield' : 'sparkles'} onPress={handleEmail} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In with Email' : 'Sign Up with Email'}
        </Button>
      </View>

      {/* Divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c('border') }} />
        <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 1, textTransform: 'uppercase', color: c('fgMuted') }}>Or continue with</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: c('border') }} />
      </View>

      {/* Sign in with Apple — iOS only, required by App Store Guideline 4.8 since
          we offer Google. Uses Apple's official branded button. */}
      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={currentThemeMode() === 'light'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={12}
          style={{ width: '100%', height: 52, marginBottom: 12 }}
          onPress={handleApple}
        />
      ) : null}

      <Button block size="lg" variant="outline" onPress={handleGoogle} disabled={busy}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GoogleMark />
          <Text style={{ fontFamily: ff.med, fontSize: 15, color: c('fg') }}>Continue with Google</Text>
        </View>
      </Button>

      {mode === 'signup' ? (
        <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', marginTop: 16, lineHeight: 16 }}>
          By signing up, you agree to our <Text style={{ color: c('primary') }} onPress={() => Linking.openURL(TERMS_URL)}>Terms of Service</Text> and <Text style={{ color: c('primary') }} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>.
        </Text>
      ) : null}

      {/* Escape hatch back to the intro — tapping "I already have an account" by
          mistake used to be a permanent one-way door. */}
      {onBackToWelcome ? (
        <Pressable onPress={onBackToWelcome} accessibilityRole="button" style={{ marginTop: 22, padding: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('fgMuted') }}>← Back to intro</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
