# SafeSpend — Auth / Security / Retention Audit (2026-07)

Scope: sign-up/login/reset, MFA, lock, deep-links, RLS reliance, data
export/delete lifecycle, notifications & retention, auth-adjacent sheets.
Baseline build at audit start: v1.9.9 (vc34). Fixes below shipped in **v2.0.0 (vc35)**.

---

## Fixed in v2.0.0 (shipped)

| # | Severity | Area | Issue | Fix |
|---|----------|------|-------|-----|
| A1 | **High (correctness)** | Login | The shared `Input` had no `autoCapitalize`/`autoCorrect`/`autoComplete`/`textContentType`. On mobile the email field auto-capitalized + autocorrected the first character → "You@…" → Supabase returns *Invalid login credentials* and the user blames their password. Affected **every** email login/signup. | `Input` now defaults email fields to `autoCapitalize=none`, `autoCorrect=false`, `autoComplete=email`, `textContentType=emailAddress`; secure fields to password-manager autofill. Explicit props still override. Fixes app-wide with zero call-site churn. |
| A2 | High (conversion) | Login | No show/hide password toggle — users type blind, mistype, bounce. | Added an eye/eyeOff reveal button to `Input`'s secure mode (new `eye`/`eyeOff` glyphs in `Icon.js`). Applies to every password field: auth, set-new-password, change-password. |
| A3 | **Medium (security)** | Data export | CSV export wrapped cells in quotes but did **not** neutralize spreadsheet formula injection. A note like `=HYPERLINK("http://evil")` or `@SUM(...)` executes when the user opens their own backup in Excel/Sheets. | New pure `csvCell()` in `lib/format.js`: prefixes `= + - @ \t \r`-leading cells with `'` and doubles embedded quotes (RFC 4180). Wired into `exportTransactionsCSV`. Locked by 4 regression tests (suite now 36/36). |

---

## Recommendations (not yet implemented — pick what to ship next)

### Tier 1 — high value, low risk

- **R1 · Notification taps don't route anywhere.** There is **no**
  `addNotificationResponseReceivedListener` / `getLastNotificationResponse`
  handler anywhere in the app. Bill reminders, budget alerts and the proactive
  shortfall notification all set `data.screen`, but nothing consumes it — tapping
  any notification just opens the app to wherever it was. This is the single
  biggest retention gap on this surface. *Fix:* add one response listener in the
  root navigator that reads `data.screen`/`data.params` and navigates (Bills,
  Budget, Dashboard). ~1 screen of code; benefits from a device tap-test.

- **R2 · "Download your data" export is incomplete.** `dataManagement.TABLES`
  covers all 16 financial tables (good — the old L5 concern is resolved), but the
  JSON export omits `profiles`, `user_settings`, and `notification_preferences`.
  For a credible GDPR "export everything," add those to an **export-only** list
  (do *not* add them to `TABLES`, which `importBackup`/`deleteAllData` also drive
  — importing settings/prefs would clobber, and delete-all intentionally keeps the
  account). Small, safe.

### Tier 2 — product decisions

- **R3 · Weak password policy.** Minimum is 6 chars everywhere and sign-up does
  **no** client-side length/strength check — the user only discovers the rule via
  a raw server error. For a finance app, raise to **8** with an inline strength
  hint and validate before submit. (Server min is a Supabase Auth setting; keep
  the two in sync.)

- **R4 · MFA lockout risk.** `MFAScreen` only offers "sign out" if the user can't
  produce a code; TOTP enrollment shows no recovery/backup codes. A lost
  authenticator = permanent lockout with no self-serve recovery. *Fix:* surface
  guidance at enrollment (save your secret / a trusted second factor), and a
  "lost access?" path (support-assisted unenroll).

- **R5 · Sign-up name friction.** Sign-up requires both first **and** last name
  before account creation. Make last name optional (or defer name capture to
  onboarding, which already prefills it) to shave a field off the highest-drop
  step.

- **R6 · Raw Supabase error passthrough.** `setError(error.message)` surfaces
  strings like *"User already registered"* / *"Email rate limit exceeded"*
  verbatim. Map the common ones to friendly copy, and on *already registered* nudge
  the user to the sign-in tab with the email prefilled.

### Tier 3 — strategic / larger lift

- **R7 · No server-driven push.** All notifications are **locally** scheduled and
  proactive alerts (shortfall/anomaly/new-sub) only compute on app open, so a
  lapsed user who stops opening the app gets nothing new. True re-engagement needs
  FCM + a scheduled edge function. Big lift; strategic for retention.

- **R8 · Name-source inconsistency.** `EditNameSheet` upserts
  `profiles.display_name` but never updates the auth `user_metadata.first_name/
  last_name` set at sign-up. Pick one canonical source and have both reads/writes
  agree, or the greeting can diverge from the profile.

- **R9 · EditName profile row not in export/delete.** Related to R2/R8 — the
  `profiles` row (display name, avatar) is outside `TABLES`, so it's neither
  exported nor cleared by "delete all data" (acceptable for delete-all, which
  keeps the account, but note it).

---

## Verified solid (no action)

- **Deep-link token handling** (`AuthContext.handleUrl`): extracts
  `access_token`/`refresh_token` from `safespend://` recovery/confirm links and
  calls `setSession`. Tokens must be valid project-signed JWTs, so a crafted deep
  link can't forge a session. Standard Supabase pattern — safe.
- **`updatePassword`** re-authenticates with the current password before updating.
- **MFAScreen** re-challenges on wrong code and has a sign-out escape.
- **SetNewPasswordScreen / ChangePasswordSheet**: min-length + confirm-match.
- **LockScreen**: biometric gate with manual retry; opt-in only.
- **RLS**: all reads/writes are user-scoped; `importBackup` upserts are
  RLS-protected against cross-user writes.
- **Account deletion**: `delete-account` edge function + sign-out; server-side
  cascade covers dependent tables.
