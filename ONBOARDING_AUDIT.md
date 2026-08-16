# SafeSpend Onboarding Audit & State-of-the-Art Recommendation

_Audited: 2026-07-10 · mobile app (Expo/RN) · versionCode 12 / 1.3.0_

This is a full teardown of the first-run funnel — from app open to activation —
benchmarked against how the current best-in-class personal-finance apps (Rocket
Money, Copilot Money, Monarch, Cal AI, YNAB) onboard. It ends with a concrete,
prioritized redesign.

---

## Part 0 — The funnel as it exists today

The complete path a new user walks:

| # | Surface | File | What happens |
|---|---------|------|--------------|
| 1 | **Auth** | [AuthScreen.js](src/screens/AuthScreen.js) | Email+password or Google. Sign-up shows a "Check your email" `Alert` then drops the user straight into the app. |
| 2 | **Onboarding** (5 steps) | [OnboardingScreen.js](src/screens/OnboardingScreen.js) | `Welcome → Currency → Accounts → Alerts → Ready`. Skip link only on Welcome. |
| 3 | **Completion** | [RootNavigator.js:438](src/navigation/RootNavigator.js) | `completeOnboarding(currency)` upserts `user_settings`; selected accounts inserted. |
| 4 | **Product tour** (5 slides) | [ProductTour.js](src/components/ProductTour.js) | Full-screen modal carousel shown **once, right after** onboarding. |
| 5 | **Activation checklist** | [DashboardScreen.js:24](src/screens/DashboardScreen.js) | 3-step nudge card on the dashboard: add account / log txn / set budget. |

The gate that decides "is this user onboarded?" is simply **"does a `user_settings`
row exist"** ([SettingsContext.js:83](src/contexts/SettingsContext.js)).

**What's already good** (credit where due):
- Safe-to-Spend-first dashboard is the right north star — the aha number is the hero.
- Notification + biometric priming uses a soft in-context offer row, not a cold OS prompt.
- Currency is captured up front (correct for an 18-currency, KES/NGN/ZAR audience).
- Accounts step pre-selects two sensible defaults so a "Skip" still yields a usable app.
- The activation checklist self-heals (steps tick off as the user acts).

---

## Part 1 — Findings (ranked by impact)

### 🔴 1. Zero funnel instrumentation — you are flying blind
There is **no analytics anywhere in the onboarding path.** (`useAnalytics.js` is
_financial_ analytics; the only `track` calls are RevenueCat's in the paywall.)
You cannot answer any of the questions that matter:
- What % finish onboarding? Where do they drop — Currency? Accounts? Alerts?
- What's median time-to-first-transaction (the real activation metric)?
- Does the product tour help or add friction? Does Skip correlate with churn?

**Everything below is a hypothesis until this exists.** State-of-the-art onboarding
is a measured, iterated loop, not a fixed script. This is the single highest-leverage fix.

### 🔴 2. Setup-first, value-last — the aha moment is buried behind 5 config screens
The user configures for 5 steps _before seeing a single number_. The apps that win
in 2025–26 front-load the "magic moment": Cal AI shows a result mid-onboarding;
Rocket Money surfaces a found subscription before asking for the sale. SafeSpend's
entire reason to exist — **the Safe-to-Spend figure** — only appears after the whole
setup + a 5-slide tour. Time-to-value is far too long.

### 🟠 3. Three overlapping "welcome" surfaces stacked back-to-back
The Onboarding **Welcome** step, the 5-slide **ProductTour**, and the dashboard
**checklist** all restate the same value props ("Welcome to SafeSpend", feature
bullets). A new user sees _two_ full welcome sequences in a row (onboarding Welcome,
then the tour fires immediately on first dashboard render — [RootNavigator.js:426](src/navigation/RootNavigator.js)).
Redundant, and it delays the app itself.

### 🟠 4. No intent / goal capture — onboarding learns nothing about the user
There's no "What brings you to SafeSpend?" (get out of debt · save for a goal · stop
overspending · just track). Every modern fintech onboarding segments on intent because
it (a) personalizes the first screen, (b) creates commitment, and (c) feeds the paywall
narrative. SafeSpend collects currency + accounts but never _why the user is here_.

### 🟠 5. Completion is a partial-state race
[RootNavigator.js:438](src/navigation/RootNavigator.js): `completeOnboarding()` flips
`isOnboardingComplete = true` **before** the `accounts` insert runs, and the insert has
no error handling. If it fails (offline, RLS hiccup), the user is marked onboarded and
lands on a dashboard with **no accounts and no retry path** — and the write isn't in the
offline queue either. Onboarding should complete atomically (or enqueue the account
insert through `writeQueue`).

### 🟠 6. Notification permission is one-shot and unrecoverable
Step 3's "Enable" calls `ensureNotificationPermission()` which fires the **real OS dialog
immediately**. On iOS and Android 13+ a denial is _permanent_ — you can never ask again;
the only recourse is deep-linking to system settings. The copy primes well, but there's
no soft pre-ask that gates the hard ask, and no recovery UX if denied. This quietly
kills your reminder/retention channel for a chunk of users.

### 🟡 7. Currency doesn't default to device locale
Default is hard-coded `'USD'` ([OnboardingScreen.js:47](src/screens/OnboardingScreen.js)).
A Nairobi or Lagos user — precisely the audience the 18-currency work targets — must
search/scroll past USD every time. Default from `expo-localization` region and pre-select it.

### 🟡 8. Product tour tells instead of shows
Five static text slides is the low-retention pattern. The high-retention pattern is
_interactive_: anchored coachmarks on the real dashboard, or a guided "log your first
transaction" moment. If the carousel stays, it should at least be skippable from slide 1
(it is) and earn its place with motion/screenshots, not paragraphs.

### 🟡 9. Email verification is ungated _and_ invisible
Sign-up drops the user in with an `Alert`; verification lives only under Profile
([ProfileScreen.js:226](src/screens/ProfileScreen.js)). Low friction is defensible, but
there's no gentle in-app banner ("Verify your email to secure your account · Resend").
Unverified accounts hurt deliverability and password-reset safety.

### 🟡 10. Checklist gating logic is buggy and inconsistent with the tour
[DashboardScreen.js:87](src/screens/DashboardScreen.js):
```js
const showChecklist = !checklistDismissed
  && (accountCount === 0 || !hasTxns || totalBudget === 0)
  && (accountCount === 0 || !hasTxns);
```
The second clause makes the `totalBudget === 0` term **dead** — the checklist hides once
an account + a txn exist, even though "Set a budget" is still open. And
`checklistDismissed` is `useState` (session-only, not persisted), so it reappears every
launch — whereas the tour's dismissal _is_ persisted (`pref_tour_seen`). Pick one model.

### 🔵 11. No progress persistence mid-onboarding
All step state is `useState`. Kill the app on step 3 → restart at step 0. Minor for a
5-step flow, but trivial to persist and it signals polish.

### 🔵 12. English-only, no i18n hooks
Every onboarding string is hard-coded English. For an explicitly international, multi-
currency product this is the worst screen to leave un-internationalized — it's the first
impression for every non-US user.

### 🔵 13. No re-engagement for drop-offs
A user who quits mid-onboarding or dismisses the checklist has nothing pulling them back
(no day-1 email, no local "finish setting up" notification). The funnel has no second act.

---

## Part 2 — The state-of-the-art target

Principles the redesign should optimize for, in order:

1. **Time-to-value over completeness.** Get to the Safe-to-Spend number in the fewest
   possible taps. Everything non-essential moves _after_ the aha.
2. **Measure everything.** Every step view / complete / skip is an event. Onboarding
   becomes an A/B-testable surface, not a fixed script.
3. **Personalize on intent.** Ask _why_ once; use it everywhere (first screen, empty
   states, paywall, notifications).
4. **Show, don't tell.** Replace the static tour with a live first-transaction moment
   and contextual coachmarks.
5. **Progressive disclosure.** Ask for the minimum now (currency + one balance),
   defer the rest to contextual prompts.
6. **Every ask is recoverable.** Soft-prompt before every hard OS permission; always
   leave a path back.

### Proposed redesigned flow

```
Auth
 └─ Sign up / Google  ──► [verify-email banner, non-blocking]
Onboarding (target: ≤4 taps to a number)
 1. Intent      "What brings you here?"  ─ 4 chips (debt / save / overspend / track)
 2. Currency    pre-selected from device locale, one tap to confirm
 3. First money "What's in your main account right now?"  ─ single amount + name
     └─►  ✨ REVEAL: "You have <X> safe to spend."   ← aha moment, mid-flow
 4. Alerts      soft-ask → OS prompt (reminders + biometric), fully skippable
   (Ready screen folded into the reveal — no separate slide)
Dashboard
 └─ Contextual coachmark on the FAB: "Tap + to log your first expense"
 └─ Checklist (persisted) tailored to the chosen intent
```

Net effect: currency + one balance is enough to render a real Safe-to-Spend number
_inside_ onboarding — value before the tour, before the second account, before budgets.
The old Accounts multi-select and the 5-slide tour become _optional, contextual_ follow-ups.

---

## ✅ Implementation status (v1.3.2 / versionCode 14)

Every finding above except full-app i18n has now shipped:

| # | Finding | Status |
|---|---------|--------|
| 1 | No funnel instrumentation | ✅ `lib/analytics.js` — `track()` + local buffer + best-effort flush to `analytics_events`. Events wired: `welcome_start/step/complete`, `signup`, `signin`, `onboarding_step/complete`, `notif_permission`, `first_transaction`, `tour_open`. **Needs the one-time `analytics_events` table** (migration documented in `analytics.js`). |
| 2 | Value-last | ✅ Pre-auth WelcomeScreen (v1.3.1) puts value + intent + currency before the sign-up wall. |
| 3 | Three welcome surfaces | ✅ ProductTour no longer auto-fires; single FAB coachmark is the first-run nudge; tour is replay-only from Profile. |
| 4 | No intent capture | ✅ Captured pre-auth; now drives Ready-screen copy **and** the dashboard checklist (title + order). |
| 5 | Completion race | ✅ Accounts inserted before the onboarded flag flips, with error toast. |
| 6 | One-shot notif ask | ✅ `requestNotifPermission()` reports `blocked`; Alerts step swaps to "Open settings" recovery when permanently denied. |
| 7 | USD hard-default | ✅ `lib/locale.js` region→currency default. |
| 8 | Tour tells not shows | ✅ Replaced auto-tour with a contextual `Coachmark` anchored to the FAB. |
| 9 | Email verify invisible | ✅ Dismissible `VerifyEmailBanner` on the dashboard (Resend + persisted dismiss). |
| 10 | Checklist dead clause | ✅ Dead clause removed; dismissal persisted (`pref_checklist_dismissed`); intent-tailored. |
| 11 | No progress persistence | ✅ OnboardingScreen persists/restores step + selections (`onboarding_progress`). |
| 13 | No re-engagement | ✅ Day-1 activation nudge scheduled on completion, cancelled on first transaction. |
| 12 | English-only i18n | ⏳ **Deliberately deferred** — full-app string extraction + translation is a separate project; faking catalogs adds no user value. This is the one remaining item. |

## Part 3 — Roadmap (original)

### Tier 1 — Instrument & fix correctness (do first, ~2–3 days)
1. **Add onboarding telemetry.** A tiny `logEvent(name, props)` helper writing to a
   Supabase `events` table (or PostHog if you want funnels/retention out of the box).
   Fire: `onboarding_step_view`, `_step_complete`, `_skip`, `onboarding_complete`,
   `first_transaction`, `tour_complete`. Nothing else on this list can be validated without it.
2. **Fix the completion race** — await the account insert _before_ flipping
   `isOnboardingComplete`, wrap in try/catch, and enqueue via `writeQueue` on failure.
3. **Fix the checklist gate** — drop the dead clause, persist `checklistDismissed`
   (AsyncStorage), and keep "Set a budget" live until done.
4. **Default currency from device locale** via `expo-localization`.

### Tier 2 — Compress time-to-value (~1 week)
5. **Add the intent step** (step 1) and thread the answer into the checklist + empty states.
6. **Collapse Accounts → "main account balance"** single input; reveal the Safe-to-Spend
   number immediately after. Move multi-account setup to a contextual "Add another account"
   prompt post-onboarding.
7. **Merge the three welcome surfaces:** delete the separate Ready step (fold into the
   reveal) and demote the ProductTour to a _replayable-from-Profile_ optional, not an
   auto-fire. Keep the checklist as the single persistent nudge.

### Tier 3 — Retention & polish (~1 week)
8. **Soft-ask before the OS notification prompt**, with a "denied? here's how to re-enable"
   recovery path deep-linking to settings.
9. **Non-blocking verify-email banner** on the dashboard for unverified accounts, with Resend.
10. **Replace the static tour with contextual coachmarks** anchored to the FAB / Safe-to-Spend
    card (a lightweight tooltip overlay), or a guided first-transaction.
11. **Persist mid-onboarding progress** and add a local "finish setting up" notification at
    day 1 for drop-offs.
12. **Internationalize onboarding strings** (the highest-value screen to translate first).

### North-star metrics to watch once instrumented
- **Activation rate** = % of sign-ups that log ≥1 real transaction within 24h (primary).
- **Onboarding completion rate** and **per-step drop-off**.
- **Time-to-first-Safe-to-Spend** (should drop from "after full setup + tour" to "mid-onboarding").
- **Notification opt-in rate** (before/after the soft-ask).
- **D1 / D7 retention**, sliced by intent answer.

---

## Appendix — file map
- Auth: [AuthScreen.js](src/screens/AuthScreen.js), [AuthContext.js](src/contexts/AuthContext.js)
- Onboarding: [OnboardingScreen.js](src/screens/OnboardingScreen.js)
- Gate + completion: [SettingsContext.js](src/contexts/SettingsContext.js), [RootNavigator.js](src/navigation/RootNavigator.js)
- Tour: [ProductTour.js](src/components/ProductTour.js)
- Checklist: [DashboardScreen.js](src/screens/DashboardScreen.js)
- Permissions: [notifications.js](src/lib/notifications.js), [AppLockContext.js](src/contexts/AppLockContext.js)
