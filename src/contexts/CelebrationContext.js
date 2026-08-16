import React, { createContext, useContext, useState, useCallback } from 'react';
import Confetti from '../components/Confetti';
import { useToast } from './ToastContext';
import { haptics } from '../lib/haptics';

/**
 * App-wide celebration: one call fires confetti + a success haptic + an optional
 * toast, from anywhere. Reserve it for genuine wins (first transaction, hitting a
 * goal, paying off a debt) so it stays special — motion as reward, not noise.
 */
const CelebrationContext = createContext({ celebrate: () => {} });

export function CelebrationProvider({ children }) {
  const [trigger, setTrigger] = useState(0);
  const { show } = useToast();

  const celebrate = useCallback((message, opts = {}) => {
    haptics.success();
    setTrigger((n) => n + 1);
    if (message) show(message, { icon: opts.icon || 'sparkles' });
  }, [show]);

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      <Confetti trigger={trigger} />
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  return useContext(CelebrationContext);
}
