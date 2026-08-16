# SafeSpend — Production-Readiness Audit (Android)

_Audited: 2026-07-10 · v1.5.0 / versionCode 16 · Expo SDK 51 / RN 0.74.5_

A whole-app review against what "shippable to the Play Store and safe to run for
real users" actually requires: stability, correctness, security/privacy, release
config, performance, store compliance, and QA. Findings are grouped and
severity-ranked, with concrete recommendations. **Verdict up front: the app is
close** — the architecture is sound and most fundamentals are in place. There are
no hard blockers in the code, but a handful of high-value gaps should be closed
before a wide launch.

## What's already right (verified)
- **Permissions are correct** — the *merged* manifest (not just the hand-edited
  source) includes `POST_NOTIFICATIONS`, `CAMERA`, `RECEIVE_BOOT_COMPLETED`,
  `USE_BIOMETRIC`, `VIBRATE`, etc., contributed by the Expo library manifests. So
  notifications (Android 13+) and camera receipt-scan work.
- **No secrets in the client** — receipt AI (`parse-receipt`), Paystack, FX, and
  the RevenueCat webhook all run in Supabase Edge Functions; only the public
  Supabase anon key + RevenueCat public key ship in the app. No hardcoded API keys.
- **Session encrypted at rest** — `LargeSecureStore` keeps the AES key in the
  device keystore, only ciphertext in AsyncStorage.
- **Account deletion in-app** (Play requirement), **data export** (portability),
  **offline write queue**, **skeletons/empty/error states**, **entitlement server
  truth** (RC→Supabase webhook, live), **reduce-motion support**.

---

## ✅ Addressed in v1.5.1 / versionCode 17
- **#2 Error boundary** — [ErrorBoundary.js](src/components/ErrorBoundary.js) wraps the whole
  app (App.js); a render error now shows a friendly "something went wrong · Try again"
  screen and reports, instead of white-screening.
- **#1 Crash reporting** — ✅ **LIVE** (v1.5.2 / vc18). `@sentry/react-native` wired via
  [errorReporting.js](src/lib/errorReporting.js) (error boundary + user-id tag in AuthContext);
  DSN set to the **`safespend`** Sentry project (org `studily`, isolated from the other app's
  `react-native` project). Native module builds clean; captures JS + native crashes.
  ✅ **Source maps upload on every release build** (v1.5.3 / vc19): Metro wrapped with
  `getSentryExpoConfig`, `sentry.gradle` applied, org auth token in `android/sentry.properties`
  (gitignored). Verified — debug id `ef8c5543…` uploaded for release `com.safespend.app@1.5.3+19`,
  so traces symbolicate. Local builds can skip upload with `SENTRY_DISABLE_AUTO_UPLOAD=true`.
- **#3 Timezone** — [date.js](src/lib/date.js) `toLocalISODate`/`todayISO`; all 28
  date-boundary sites swept off UTC `toISOString()` → correct months/periods for non-UTC users.

## 🔴 High — close before a wide launch

### 1. No crash reporting — you are blind to production crashes
There is **no Sentry / Crashlytics / Bugsnag** anywhere. Once real users hit
edge cases you can't reproduce, you'll have zero visibility into what crashed,
how often, or on which devices. This is the single most important operational
gap for a shipping app.
**Fix:** add `sentry-expo` (or `@sentry/react-native`) with release + dist tags.
Wire it before launch so day-1 issues are visible.

### 2. No React error boundary — one render error white-screens the whole app
Nothing catches render-time exceptions. A single bad value (a malformed category
color, an unexpected null) throwing in any screen takes the **entire app** to a
blank screen with no recovery. For a finance app users trust with their money,
that's a trust-killer.
**Fix:** wrap `RootNavigator` in an error boundary that shows a friendly "something
went wrong — reload" screen (and reports to Sentry). ~30 lines, high payoff.

### 3. Date/period math shifts by a day for users far from UTC (incl. your KES market)
Month/period bounds are computed as `new Date(year, month, 1).toISOString()`
(28 call sites, e.g. `useDashboardData` `monthBounds`, `AttentionContext`).
`new Date(y,m,1)` is **local** midnight; `.toISOString()` converts to **UTC**. For a
user in Kenya (UTC+3) — a primary target market — the July window computes as
`[2026-06-30, 2026-07-31)` instead of `[2026-07-01, 2026-08-01)`. Result: late-night
and month-boundary transactions land in the **wrong month**, so dashboard totals,
budgets, and "safe to spend" can be subtly wrong for everyone not on UTC.
**Fix:** a `toLocalISODate(d)` helper using `getFullYear/getMonth/getDate` (no
`toISOString`) for all date-boundary strings. Audit the 28 sites.

---

## 🟠 Medium — should fix, not blocking

### 4. Release build is not minified or resource-shrunk (R8/ProGuard off)
`enableProguardInReleaseBuilds` and `shrinkResources` both default **false**
([build.gradle](android/app/build.gradle)). The AAB is larger than it needs to be
and the JS-adjacent Java/Kotlin isn't obfuscated. **Fix:** enable R8 +
`shrinkResources` for release, add the standard RN/Expo ProGuard keep rules, and
**re-test thoroughly** (minification can break reflection-based libs — test
notifications, RevenueCat, image-picker, SVG, widget).

### 5. No automated tests
Zero unit/integration tests. The app is now large (subscriptions, multi-currency,
gating, motion) and every change is validated only by a bundle export + manual
build. **Fix:** start with the pure logic that's easiest to break and most
costly if wrong — `computeBalances`, `computeAvailableToSpend`, FX `convert`, the
new `toLocalISODate`, entitlement resolution. Jest + a few golden cases.

### 6. Home-screen widget unverified on real hardware
Per the build notes, the native `SafeSpendWidget` (reads AsyncStorage's SQLite)
was compiled + packaged but **never confirmed on a device**. Widgets fail quietly.
**Fix:** add the widget on a real phone, confirm the Safe-to-Spend number appears
after opening the app once, and that hide-balances masks it.

### 7. Verify `targetSdk 34` still meets Play's minimum
`targetSdkVersion` defaults to **34** ([build.gradle](android/build.gradle)). Google
raises the required target ~yearly (API 35 / Android 15 is the likely current
floor for updates by mid-2026). If 34 is now below the minimum, Play will reject
updates. **Fix:** confirm in Play Console; if bumping to 35, re-test the Android-15
behaviors already patched (the Kotlin `removeLast` fix, edge-to-edge, notifications).

### 8. Confirm Supabase auth token refresh on foreground
Supabase JS is configured with `autoRefreshToken: true`, but RN apps should also
call `supabase.auth.startAutoRefresh()/stopAutoRefresh()` on `AppState`
changes so long-backgrounded sessions refresh reliably. **Fix:** verify this is
wired (or add it) to avoid users being silently logged out / stale tokens.

### 9. Analytics won't record until the backend table exists
The `analytics_events` table (onboarding + paywall funnels) still needs creating
in Supabase — until then events buffer locally only. Coordinate with the web
agent (spec already drafted).

---

## 🔵 Low — housekeeping / polish
- **Font asset bloat:** the export bundles many **unused** JetBrains Mono / Inter
  weights + italics (importing named exports pulls the whole package's `.ttf`s).
  Trim to the ~8 used weights to shave a few MB.
- **`allowBackup="true"`** on a finance app: Android auto-backup copies AsyncStorage
  (widget snapshot, prefs, analytics buffer) to the cloud in plaintext (the session
  ciphertext is safe — key isn't backed up). Consider `fullBackupContent` rules or
  disabling backup for sensitive keys.
- **Legacy storage permissions** (`READ/WRITE_EXTERNAL_STORAGE`, from image-picker/
  view-shot) — mostly no-ops on modern Android but show up in Data Safety; review.
- **Stale `TODO`** in [revenuecat.js](src/lib/revenuecat.js) (keys are done).
- **One non-`__DEV__` `console.warn`** in [AddSheet.js:204](src/screens/AddSheet.js).

---

## 📋 Play Store submission checklist (Console tasks — can't verify from code)
These are gates for the store listing, independent of the code:
- [ ] **Data Safety form** — declare financial info, email, purchase history, and
  how they're used/shared (Supabase, RevenueCat, Paystack).
- [ ] **Privacy Policy + Terms URLs live** (`gosafespend.com/privacy`, `/terms` are
  linked in-app — confirm they resolve).
- [ ] **Account-deletion URL** for the listing (in-app delete exists ✓; Play also
  wants a public "how to delete your account/data" URL).
- [ ] **Content rating** questionnaire.
- [ ] **App access** — the app is login-gated; provide review **test credentials**
  or reviewers can't get past auth.
- [ ] **Subscriptions** — Play products + 7-day annual trial live (done per notes);
  confirm real-device purchase in the internal track.
- [ ] **Pre-launch report** — let Play's automated crawler run; triage its crash/
  accessibility findings.
- [ ] Store assets: screenshots, feature graphic, short/full description.

---

## Known deferrals (tracked in the other audit docs — not blockers)
- **iOS** unwired (Android-only for now).
- **Full i18n** — deferred until traction (user decision).
- **RC→Supabase webhook web-side read** — web app should treat
  `revenuecat_entitlements.is_active` as Premium (web-agent task).
- Motion Tier-3 extras (under-budget-month, streak celebrations).

---

## Recommended order of operations before flipping to production
1. **Error boundary + Sentry** (#1, #2) — you must be able to see and survive crashes.
2. **Timezone date fix** (#3) — correctness for your actual users.
3. **Widget on-device check** (#6) + **auth-refresh verification** (#8).
4. **Confirm targetSdk / Data Safety / test credentials** (#7 + store checklist).
5. **Create `analytics_events`** (#9) so launch metrics record from day one.
6. Then, post-launch: R8/minify (#4), a first test suite (#5), font trim.
