import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase';
import { configureRevenueCat, rcLogIn, rcLogOut } from '../lib/revenuecat';
import { setUserContext } from '../lib/errorReporting';

WebBrowser.maybeCompleteAuthSession();

// Configure RevenueCat once, before any auth state resolves. No-ops until the
// API key is set (see src/lib/revenuecat.js).
configureRevenueCat();

// Pull access/refresh tokens out of an OAuth callback URL (hash or query).
function tokensFromUrl(url) {
  const out = {};
  const frag = url.includes('#') ? url.split('#')[1] : url.split('?')[1] || '';
  frag.split('&').forEach((kv) => {
    const [k, v] = kv.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return out;
}

const AuthContext = createContext(undefined);

const redirectTo = Linking.createURL('/');

// Keep token auto-refresh tied to app foreground state (Supabase RN guidance).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [recovery, setRecovery] = useState(false);

  const checkMFARequired = async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return false;
    const needsMFA = data.nextLevel === 'aal2' && data.currentLevel === 'aal1';
    setMfaRequired(needsMFA);
    return needsMFA;
  };

  const setMfaVerified = () => setMfaRequired(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setUserContext(s?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (s?.user) {
        rcLogIn(s.user.id);
        setTimeout(() => { checkMFARequired(); }, 0);
      } else {
        rcLogOut();
        setMfaRequired(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) { rcLogIn(s.user.id); await checkMFARequired(); }
      setLoading(false);
    });

    // Handle deep links from email (password recovery / confirmation) by turning
    // the token in the URL into a session. The native scheme is `safespend://`.
    const handleUrl = async (url) => {
      if (!url) return;
      const { access_token, refresh_token, type } = tokensFromUrl(url);
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        if (type === 'recovery' || url.includes('reset-password')) setRecovery(true);
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const linkSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => { subscription.unsubscribe(); linkSub.remove(); };
  }, []);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error, mfaRequired: false };
    const needsMFA = await checkMFARequired();
    return { error: null, mfaRequired: needsMFA };
  };

  const signUp = async (email, password, firstName, lastName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName }, emailRedirectTo: redirectTo },
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error };
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') return { error: null }; // user cancelled
    const { access_token, refresh_token } = tokensFromUrl(res.url);
    if (!access_token) return { error: new Error('No session returned from Google') };
    const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
    return { error: setErr };
  };

  // Native Sign in with Apple (iOS only) — required by App Store Guideline 4.8
  // because we also offer Google sign-in. Uses the identity token directly with
  // Supabase (no nonce on either side, matching Supabase's Expo guidance).
  const signInWithApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) return { error: new Error('No identity token returned from Apple.') };
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) return { error };
      // Apple returns the name ONLY on the first authorization — capture it as the
      // display name so the app can greet the user (best-effort).
      const fn = credential.fullName?.givenName;
      const ln = credential.fullName?.familyName;
      if (fn || ln) {
        await supabase.auth.updateUser({ data: { first_name: fn || '', last_name: ln || '' } }).catch(() => {});
      }
      return { error: null };
    } catch (e) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null }; // user dismissed the sheet
      return { error: e };
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/reset-password'),
    });
    return { error };
  };

  const enrollMFA = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
    if (error) return { data: null, error };
    return { data, error: null };
  };

  const challengeMFA = async (factorId) => {
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error) return { data: null, error };
    return { data: { id: data.id }, error: null };
  };

  const verifyMFA = async (factorId, challengeId, code) => {
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    return { error };
  };

  const getMFAFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { data: null, error };
    return { data: { totp: data.totp }, error: null };
  };

  const unenrollMFA = async (factorId) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    return { error };
  };

  const updatePassword = async (currentPassword, newPassword) => {
    const email = user?.email;
    if (!email) return { error: new Error('No email found for user') };
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) return { error: new Error('Current password is incorrect') };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const updatePasswordFromReset = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const clearRecovery = () => setRecovery(false);

  // Re-send the signup confirmation email.
  const resendVerification = async () => {
    const email = user?.email;
    if (!email) return { error: new Error('No email on file') };
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
    return { error };
  };

  // --- Linked identities (Google) ---
  const getIdentities = async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) return { data: null, error };
    return { data: data.identities || [], error: null };
  };

  const linkGoogle = async () => {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error };
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') return { error: null }; // cancelled
    const { access_token, refresh_token } = tokensFromUrl(res.url);
    if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
    await supabase.auth.refreshSession();
    return { error: null };
  };

  const unlinkIdentity = async (identity) => {
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (!error) await supabase.auth.refreshSession();
    return { error };
  };

  // Permanently delete the auth account via the edge function (service-role).
  const deleteAccount = async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return { error: new Error('Not signed in') };
    const { data, error } = await supabase.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    if (error) {
      // supabase-js hides the server's message inside the wrapped Response, and
      // it is the part worth showing -- it says what the user has to do (cancel
      // a subscription we could not cancel for them).
      let detail = '';
      try { detail = (await error.context?.json())?.message || ''; } catch { /* not JSON */ }
      return { error: new Error(detail || error.message) };
    }
    await supabase.auth.signOut();
    // A store subscription outlives the account -- Apple and Google bill it, so
    // we cannot cancel it here and the user has to be told, not reassured.
    return { error: null, warning: data?.store_subscription_active ? data.warning : null };
  };

  const provider = user?.app_metadata?.provider || 'email';
  const isEmailVerified =
    !!user?.email_confirmed_at ||
    ['google', 'github', 'facebook', 'apple'].includes(provider);

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, mfaRequired, recovery, provider,
        signIn, signUp, signInWithGoogle, signInWithApple, signOut, resetPassword,
        updatePassword, updatePasswordFromReset, clearRecovery,
        enrollMFA, challengeMFA, verifyMFA, getMFAFactors, unenrollMFA,
        checkMFARequired, setMfaVerified, isEmailVerified,
        resendVerification, getIdentities, linkGoogle, unlinkIdentity, deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
