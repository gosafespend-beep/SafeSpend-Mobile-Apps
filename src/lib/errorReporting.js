import * as Sentry from '@sentry/react-native';

// Crash + error reporting. A DSN is NOT a secret (safe to ship, like the
// RevenueCat public key) — paste yours below to turn reporting on. Leave it ''
// to keep reporting disabled (init no-ops, capture* just logs in dev).
//
//   1. Create a project at sentry.io → Settings → Client Keys (DSN).
//   2. Paste the DSN here and rebuild.
const SENTRY_DSN = 'https://8c64a5188fcef75b6f9240813ebdc8b2@o4511474100994048.ingest.us.sentry.io/4511710740348928';

let enabled = false;

/** Call once at app startup. No-ops if no DSN is set. */
export function initErrorReporting() {
  if (!SENTRY_DSN) return;
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      enableNative: true,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: 0, // errors only for now (no performance tracing)
    });
    enabled = true;
  } catch (e) {
    if (__DEV__) console.warn('[errorReporting] init failed:', e?.message);
  }
}

/** Report a caught error (used by the ErrorBoundary and key catch sites). */
export function captureException(error, context) {
  if (enabled) {
    try { Sentry.captureException(error, context ? { extra: context } : undefined); } catch { /* never throw from reporting */ }
  } else if (__DEV__) {
    console.warn('[errorReporting]', error?.message || error, context || '');
  }
}

/** Tag events with the signed-in user (id only — no PII beyond that). */
export function setUserContext(user) {
  if (!enabled) return;
  try { Sentry.setUser(user ? { id: user.id } : null); } catch { /* ignore */ }
}
