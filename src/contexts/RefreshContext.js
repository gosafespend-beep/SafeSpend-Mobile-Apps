import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// A global "pull-to-refresh" signal. Data hooks include `tick` in their load
// effect deps so they refetch in place (no remount, no spinner flash).
const RefreshContext = createContext({ tick: 0, bump: () => {} });

// Module-level handle to the live provider's bump. Entity sheets used to signal
// a successful write only through their caller's `onSaved`, which was almost
// always that ONE screen's local `reload` — so every other mounted consumer kept
// stale data (a new account stayed invisible in the permanently-mounted AddSheet
// picker, and a new bill left Safe-to-Spend overstated until an app restart).
// Exposing the bump this way lets any save path signal the whole app without
// threading a callback through every screen.
let globalBump = () => {};

/** Trigger the app-wide refetch from anywhere — including outside React. */
export function bumpRefresh() { globalBump(); }

export function RefreshProvider({ children }) {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    globalBump = bump;
    return () => { globalBump = () => {}; };
  }, [bump]);
  return <RefreshContext.Provider value={{ tick, bump }}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  return useContext(RefreshContext);
}
