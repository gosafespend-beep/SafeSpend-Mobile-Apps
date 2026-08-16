# Safe Spend Mobile — Backend Wiring Status

This app started as the **design kit** (all 22 screens, mock seed data). It is now
being wired to the **real Supabase backend** (the same project the web app uses:
`qeogqvjqvafbzufanwki`). This doc tracks what's live vs. still on seed data, and
the pattern for wiring the rest.

## Architecture added on top of the design kit

| File | Purpose |
|------|---------|
| `src/lib/supabase.js` | Supabase client. Sessions stored **encrypted** (AES-256 key in SecureStore, ciphertext in AsyncStorage). |
| `src/contexts/AuthContext.js` | Email/password sign in & up, Google OAuth (WebBrowser), password reset, MFA helpers, foreground token refresh. |
| `src/contexts/SettingsContext.js` | Loads `user_settings` (currency). A settings row existing == onboarding complete (mirrors the web app). |
| `src/hooks/useDashboardData.js` | Aggregates current-month accounts/expenses/incomes/categories/budgets for the dashboard. |
| `src/lib/format.js` | `money()` now takes a `currency` — pass the user's currency from `useSettings()`. |

`App.js` wraps everything in `<AuthProvider><SettingsProvider>`. `RootNavigator.js`
gates on the **real session** and **real onboarding state** (no more local booleans).

## Wired to real data ✅

- **Auth gate** — real Supabase auth. Email/password, Google, forgot-password.
- **Onboarding** — persists chosen currency + creates the selected accounts.
- **Dashboard** — live balance, income, expenses, net, spending donut, budget bars, recent txns.
- **Add sheet (+)** — inserts a real expense/income, then refreshes the dashboard.
- **Log / Transactions** — real txns grouped by day with per-day totals; All/Income/Expenses filter. (`useTransactions`)
- **Accounts** — real accounts with running balances (initial + income − expense); net worth hero. (`useAccounts`)
- **Goals** — real savings goals, ring progress, deadline + suggested monthly save. (`useGoals`)
- **Debt** — real debts, avalanche/snowball ordering, payoff progress, derived priority. (`useDebts`)
- **Budget** — income to allocate, per-category limits vs. current spend. (`useBudget`)
- **Categories** — expense/income categories with this month's transaction counts. (`useCategories`)
- **Profile** — real name, email, initials, currency, subscription plan badge. (`useProfileInfo`)
- **Reports** — net worth, savings-rate health score, net-worth trend (networth_snapshots), emergency-fund coverage, upcoming bills. (`useReports`)
- **Bill Calendar** — real bills on a live month grid with paid/unpaid status from bill_statuses. (`useBills`)
- **Search** — live filtering of all transactions by merchant/note/category with match totals. (`useTransactions`)
- **Notifications** — loads + persists the 4 real notification_preferences columns. (`useNotificationPrefs`)
- **Paywall** — live subscription state; CTA runs real Paystack checkout (initialize → in-app browser → verify). (`useSubscription`)
- **Detail screens** (Transaction / Account / Goal / Debt) — receive the tapped row via `RootNavigator` `setDetail({ kind, data })` and load their own history (account activity, goal contributions, debt payments). (`useDetails`)
- **Sign out** — More → Sign out.

## Status: fully interactive ✅

Every screen reads **and writes** live Supabase data. Create/update/delete actions wired:

- **Add** account, category (expense/income), goal, debt, bill, transaction (+ sheet).
- **Contributions** (goal) and **payments** (debt) via the atomic balance RPCs
  (`atomic_increment_goal_amount`, `atomic_decrement_debt_balance`).
- **Edit / Delete** transactions from the detail screen.
- **Mark bill paid** (tap an upcoming bill) → writes `bill_statuses`.
- **Deposit / Withdraw** on an account (recorded as income/expense tied to the account).
- **Notification preferences** persist; **Paywall** runs real Paystack checkout.

All add/edit forms use a shared keyboard-aware bottom sheet (`src/components/FormSheet.js`)
with haptics; entity forms live in `src/sheets/`. **Pull-to-refresh** on every screen
(re-mounts the active screen via a refresh key in `RootNavigator`).

## On-device audit fixes (round 4 — verified on real phone)

Ran the app on a real Android device (Samsung A04s) and audited every screen with
live data. All fixes below were verified on-device:

- **More screen was seed data** → now real: profile card shows the actual user
  (name/email/plan via `useProfileInfo`), row counts are live (accounts, upcoming
  bills, debt total, goals); removed the "Design reference" rows (States gallery /
  Search results) and the dead Net-worth row.
- **Transactions showed raw category UUIDs** (web bill-automation stores `category`
  as an id) → `useTransactions` + `useDashboardData` resolve id→name (and icon).
- **All category/goal/budget icons were the generic fallback** → new `src/lib/icons.js`
  `normalizeIcon()` maps web/Lucide names to the mobile icon set; applied in
  `useCategories`, `useGoals`, `useBudget`.
- **`hsl(NaN)` color warnings** (legacy category colors) → hardened `parseTriplet`.
- **Raw-triplet SVG color errors** (bill palette) → `useBills` returns `hsl()` strings.

Screens verified clean on-device: Auth, Dashboard, Budget, Log, Reports, More,
Accounts, Account detail, Goals, Debt, Profile, Categories (13 screens). Balance
($173,000) is identical across Dashboard / Accounts / Reports.

> Device-run caveat: Expo Go on the phone is SDK 54 (Play auto-updates it); the
> project is SDK 51, so testing requires the SDK-51 Expo Go (or a standalone build).
> A standalone APK (`expo prebuild` + Gradle) was attempted but the local Gradle
> build stalled on throttled Google-Maven downloads — EAS cloud build is the path.

## Audit fixes applied (round 3 — final)

- **Biometric app-lock** (`AppLockContext` + `LockScreen`, `expo-local-authentication`):
  optional fingerprint/Face-ID lock on cold start and on return from background;
  toggle in Profile → Preferences (only shown when the device supports it).
- **Edit-transaction category picker** — the edit sheet now picks from the user's real
  categories (chips) instead of free text, keeping a legacy value if it's not in the list.
- **"Mark bill paid" now moves money** — records a real expense on the primary account
  and links it via `bill_statuses.expense_id`, guarded so paying twice can't double-charge.
- **Smooth pull-to-refresh** — a `RefreshContext` tick makes every data hook refetch
  **in place**; screens keep showing data during refresh (no spinner flash / remount).

## Audit fixes applied (round 2)

- **Full edit + delete CRUD** for accounts, categories, goals, debts, and bills —
  long-press a row (or the ⋯ menu on categories) for Edit / Delete. The add-sheets
  double as edit-sheets via an `editing` prop. Deletes cascade history where needed
  (goal contributions, debt payments) and use `delete_account_cascade` for accounts.
- **Native date pickers** (`DateField` in FormSheet, `@react-native-community/datetimepicker`)
  on add-transaction (backdating), edit-transaction, and goal deadline.
- **Accessibility**: `accessibilityRole`/`accessibilityLabel`/`accessibilityState` on the
  FAB, header back, tab bar, and the shared `Button`.
- **Haptics**: medium impact on the FAB, selection tick on tab switches (form-sheet
  saves already buzzed).

## Audit fixes applied (round 1)

- **Balance is now computed one way** via `src/lib/balances.js` (`computeBalances`) —
  Dashboard, Accounts, and Reports all show the same running net worth.
- **AddSheet overhauled**: real currency symbol, the user's real categories, an
  **account picker** (so transactions affect balances), keyboard-aware, haptics.
- **MFA gate** (`MFAScreen`) — accounts with 2FA must enter a TOTP code on mobile.
- **Error handling** in all 12 data hooks (try/catch/finally + `error`); screens show
  a retry `ErrorState` instead of an endless spinner.
- **Password reset deep link** handled (`SetNewPasswordScreen` + recovery flow in
  AuthContext); `safespend://` URLs turn the email token into a session.
- **Profile is honest now** — removed fake Face ID / 2FA / iCloud / version claims;
  real version via `expo-constants`; functional Change Password + Edit Name sheets.
- **Zero-decimal currencies** (JPY/KRW) render correctly; atomic RPC errors surfaced.

### Not yet implemented (intentional, low-priority)
- Account-to-account **Transfer** (needs paired ledger entries — deferred).
- Detail-screen **hero balances** can be one action stale until reopened (lists refresh live).
- Paystack checkout requires the `paystack-*` edge functions deployed + provider config;
  Google sign-in needs `safespend://` in Supabase redirect allow-list.

> **All 18 audit findings (#1–#18) are now addressed.** The remaining items above are
> product/deploy decisions, not audit defects.

> ⚠️ Everything is **compile-verified only** — the app has not yet been run on a device
> or emulator. A runtime pass is the recommended next step before release.

## The pattern for wiring a screen

1. Add a hook in `src/hooks/` that queries the relevant table(s), e.g.
   `supabase.from('debts').select('*').eq('user_id', user.id)` (RLS scopes to the user).
2. In the screen, replace the in-file seed array with the hook's data; keep all the
   existing JSX/components — only the data source changes.
3. Format money with `money(n, { currency })` from `useSettings()`.
4. For detail screens, pass the selected row via the `txn`/`account`/`goal`/`debt`
   prop already accepted (wire the id through `RootNavigator`'s `setDetail`).

Table → column reference lives in the web repo's
`src/integrations/supabase/types.ts`. Note: `expenses.category` / `incomes.source`
store the **category name** (a string), not an id.

## Run it (Android, on this Windows machine)

```bash
cd C:\safespend\SafeSpendMobile
npx expo start            # press 'a' for emulator, or scan QR with Expo Go
# or a dev build / APK:
npx expo run:android
```

## Before shipping

- **Google sign-in** needs the redirect URL `safespend://` added to Supabase Auth →
  URL Configuration, and the Google provider enabled.
- **Deep links** for email confirmation / password reset use the `safespend://` scheme
  (already set in `app.json`); add them to Supabase redirect allow-list too.
- iOS build later via EAS cloud (no Mac needed): `eas build -p ios`.
