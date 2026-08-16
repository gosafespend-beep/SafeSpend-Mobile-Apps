import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

// Human-readable name for the device's biometric unlock, so copy reads naturally
// per platform (iPhones have no "fingerprint" — it's Face ID / Touch ID).
export const BIOMETRIC_LABEL = Platform.OS === 'ios' ? 'Face ID or Touch ID' : 'fingerprint or face';

const AppLockContext = createContext(undefined);
const STORAGE_KEY = 'appLockEnabled';

/**
 * Optional biometric (fingerprint / Face ID) app-lock. When enabled, the app
 * locks on cold start and whenever it returns from the background, requiring a
 * device authentication to continue.
 */
export function AppLockProvider({ children }) {
  const [enabled, setEnabledState] = useState(false);
  const [supported, setSupported] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      setSupported(hasHardware && enrolled);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const on = stored === 'true' && hasHardware && enrolled;
      setEnabledState(on);
      setLocked(on); // lock on cold start
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (enabled && prev === 'active' && next.match(/inactive|background/)) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const authenticate = async () => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Safe Spend',
      fallbackLabel: 'Use device passcode',
    });
    return res.success;
  };

  const unlock = async () => {
    const ok = await authenticate();
    if (ok) setLocked(false);
    return ok;
  };

  const setEnabled = async (value) => {
    if (value) {
      const ok = await authenticate(); // confirm identity before enabling
      if (!ok) return false;
    }
    await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    setEnabledState(value);
    setLocked(false);
    return true;
  };

  return (
    <AppLockContext.Provider value={{ enabled, supported, locked: enabled && locked, ready, unlock, setEnabled }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (ctx === undefined) throw new Error('useAppLock must be used within an AppLockProvider');
  return ctx;
}
