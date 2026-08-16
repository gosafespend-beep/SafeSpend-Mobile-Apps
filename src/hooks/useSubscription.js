// Back-compat shim. Entitlement now lives in a single app-wide provider so the
// paywall, gating, and profile badge can never disagree. See EntitlementContext.
import { useEntitlement } from '../contexts/EntitlementContext';

export function useSubscription() {
  return useEntitlement();
}
