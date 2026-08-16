import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveRegion, detectCountry, captureMethodsFor } from '../lib/regions';

// App-wide region/context. Detects the user's country from the device, lets them
// override it (persisted), and exposes the resolved region config + the capture
// methods relevant to that market. Everything region-aware reads from here.
//
// Note: stored client-side for now (`pref_country`). Syncing country to
// `user_settings` for cross-device/web parity is a follow-up that needs a shared
// backend migration (coordinate with the web agent).
const COUNTRY_KEY = 'pref_country';

const RegionContext = createContext(null);

export function RegionProvider({ children }) {
  const [country, setCountryState] = useState(() => detectCountry() || null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(COUNTRY_KEY).then((stored) => {
      if (!active) return;
      if (stored) {
        setCountryState(stored.toUpperCase());
      } else {
        const d = detectCountry();
        if (d) { setCountryState(d); AsyncStorage.setItem(COUNTRY_KEY, d).catch(() => {}); }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { active = false; };
  }, []);

  const setCountry = useCallback((cc) => {
    const up = String(cc || '').toUpperCase();
    setCountryState(up || null);
    AsyncStorage.setItem(COUNTRY_KEY, up).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    country,
    region: resolveRegion(country),
    captureMethods: captureMethodsFor(country),
    setCountry,
    loaded,
  }), [country, setCountry, loaded]);

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  return useContext(RegionContext) || {
    country: null,
    region: resolveRegion(null),
    captureMethods: captureMethodsFor(null),
    setCountry: () => {},
    loaded: true,
  };
}
