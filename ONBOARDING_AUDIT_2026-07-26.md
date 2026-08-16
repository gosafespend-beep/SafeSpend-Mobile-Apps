# SafeSpend Onboarding — Audit & State-of-the-Art Recommendation (round 2)

_Audited 2026-07-26 · v2.0.1 / versionCode 36 · supersedes `ONBOARDING_AUDIT.md` (2026-07-10, vc12)_

The 2026-07-10 audit found 13 issues and shipped fixes for 12 of them. This round
re-audits the funnel as it actually exists now, verifies whether those fixes delivered
what was recommended, and benchmarks the result against how the best-converting
consumer-subscription and fintech apps onboard in 2025–26.

**Verdict in one line:** the funnel is now well-built, well-instrumented and polished —
but it still asks for a credit card before the user has seen a single number that
required the product to compute it. The prior audit's highest-leverage recommendation
(reveal Safe-to-Spend mid-flow) was closed out with a weaker substitute. Separately,
onboarding writes the wrong account `type` for every account it creates, which
systematically corrupts the app's hero metric from first run.

---

## Part 0 — The funnel as it exists today

| # | Surface | File | Steps / what happens |
|---|---------|------|----------------------|
| 1 | **Pre-auth welcome** | [WelcomeScreen.js](src/screens/WelcomeScreen.js) | 3 steps: `Intro` (4 value-prop bullets) → `Goal` (4 intent chips) → `Currency` (searchable 18-item list). CTA: Create account / I already have one. |
| 2 | **Auth** | [AuthScreen.js](src/screens/AuthScreen.js) | Email + password + **first name + last name** (4 fields), or Google. Sign-up shows a "Check your email" `Alert`, then proceeds. |
| 3 | **Onboarding** | [OnboardingScreen.js](src/screens/OnboardingScreen.js) | 3 steps when arriving from welcome (`Accounts` → `Alerts` → `Ready`); 5 if not (`Welcome` + `Currency` prepended). |
| 4 | **Completion** | [RootNavigator.js:537](src/navigation/RootNavigator.js) | Accounts inserted **before** the onboarded flag flips (race correctly fixed last round), then `completeOnboarding(currency)`. |
| 5 | **Paywall (auto)** | [RootNavigator.js:473](src/navigation/RootNavigator.js) | Fires **immediately** on first arrival at the app for any non-subscribed user, gated once by `pref_trial_offered`. |
| 6 | **Dashboard nudges** | [DashboardScreen.js:199](src/screens/DashboardScreen.js) | Read-only banner (if `!canWrite`) + verify-email banner + intent-tailored activation checklist. |
| 7 | **FAB coachmark** | [Coachmark.js](src/components/Coachmark.js) | One-shot "tap + to log" tooltip on the home tab. |

Total surfaces before the user reaches an unobstructed dashboard: **7**, including a
full-screen paywall modal.

### What's genuinely good (credit where due)

These are at or above industry standard and should not be touched:

- **Value/intent captured pre-auth.** Meeting the product before the sign-up wall is
  the right architecture, and most finance apps still get this wrong.
- **Intent is actually threaded through**, not vanity data: it drives the Ready-step
  line ([OnboardingScreen.js:290](src/screens/OnboardingScreen.js)) and the dashboard
  checklist's title *and* step order ([DashboardScreen.js:22](src/screens/DashboardScreen.js)).
- **Locale-derived currency default** (`guessCurrency`) — correct for a KES/NGN/ZAR audience.
- **Recoverable notification permission.** `requestNotifPermission()` returns `blocked`,
  and the row swaps to "Open settings" ([OnboardingScreen.js:266](src/screens/OnboardingScreen.js)).
  Genuinely better than most apps, which dead-end on a denial.
- **Progress persistence** mid-onboarding, and a day-1 activation nudge cancelled on
  first transaction.
- **The paywall's trial timeline** (Today → Day 5 reminder → Day 7 charge,
  [PaywallScreen.js:258](src/screens/PaywallScreen.js)) and its **real regional price math**
  are best-in-class. Most apps hide the charge date; this one draws it.
- **No fabricated social proof.** Deliberate, and correct.
- **Per-entry-point paywall copy** (`SOURCE_COPY`) — the right instinct.

---

## Part 1 — Findings, ranked by impact

### 🔴 F1 — Onboarding writes the wrong account `type` for every account, corrupting the hero metric

Not a design issue — a **data-integrity bug**, and the highest-value fix in this document.

[RootNavigator.js:547](src/navigation/RootNavigator.js) hardcodes `type: 'bank'` for
every account onboarding creates. But the presets
([OnboardingScreen.js:49-54](src/screens/OnboardingScreen.js)) include **"Savings Account"**
and **"Credit Card"**, and `balances.js` treats those types as fundamentally different:

- [balances.js:65-68](src/lib/balances.js) — `NON_LIQUID = {savings, investment, retirement}`
  is excluded from `liquidAssets`, which feeds Safe-to-Spend. A savings account written as
  `'bank'` **is counted as spendable → Safe-to-Spend is inflated by the user's entire
  savings balance.** This is precisely the flaw the v1.7.0 "Safe-to-Spend v2" work fixed
  inside `balances.js` — and onboarding silently defeats it for the primary way new users
  create accounts.
- [balances.js:39,47](src/lib/balances.js) — credit accounts track amount **owed** with
  flipped signs. A "Credit Card" written as `'bank'` is treated as an asset, so the balance
  the user types (their debt) is **added to net worth as a positive, spendable asset.**
  Wrong sign *and* wrong liquidity.
- Compounding it: the onboarding balance field is labelled just "Starting balance"
  ([OnboardingScreen.js:238](src/screens/OnboardingScreen.js)), whereas `AccountSheet`
  correctly relabels to **"Amount owed"** for credit
  ([AccountSheet.js:99](src/sheets/AccountSheet.js)). Onboarding actively invites the user
  to enter debt as though it were money they have.

**And there is no remedy available to the user.** The account-type picker offers only
Bank / Cash / Credit ([palette.js:7-11](src/sheets/palette.js)) — **there is no "Savings"
option anywhere in the mobile app.** Confirmed by grep: the only `type:` write in the whole
mobile codebase is `RootNavigator.js:547`, and `type:'savings'` appears solely in
[money.test.js:85](src/lib/__tests__/money.test.js). So the savings-exclusion logic is unit-tested
but **unreachable through any mobile UI path** — a mobile user's savings will always inflate
Safe-to-Spend, forever, with no way to correct it.

Net effect: the number the whole product is built around is systematically over-reported for
the two most common non-checking account types, beginning at first run.

### 🔴 F2 — The card is requested before any value is delivered

[RootNavigator.js:473-483](src/navigation/RootNavigator.js) auto-presents the paywall the
instant a set-up, non-subscribed user reaches the app — before the dashboard is seen, before
a single transaction exists. Because `canWrite = isPremium`, the entire activation loop is
then behind the purchase:

- Checklist step "Log your first transaction" ([DashboardScreen.js:203](src/screens/DashboardScreen.js))
  → `onAdd()` → FAB path → `requireWrite` → paywall.
- The FAB coachmark ("tap + to log your first expense") → paywall.
- Consequently `first_transaction` and the activation-nudge cancellation **can never fire for
  a non-subscriber** — the activation metric the last audit introduced is unreachable for
  exactly the population it was meant to measure.

And what does the user see behind that wall? For a brand-new account with only typed starting
balances and zero transactions/bills/recurring income, Safe-to-Spend ≈ the number they just
typed in themselves. **There is no moment where the product tells the user something they
didn't already know.**

The read-only / card-up-front model was a deliberate, documented business decision and this
finding does **not** argue against it. The problem is *sequencing within* that model: every
high-converting card-up-front app (Cal AI, Blinkist, Noom) shows a **personalized computed
result** first, and only then asks. SafeSpend asks first.

### 🟠 F3 — The prior audit's #1 recommendation was marked ✅ but not delivered

`ONBOARDING_AUDIT.md` Part 2 (lines 152-156) and Tier 2 item 6 specified, concretely:

> 3. First money "What's in your main account right now?" ─ single amount + name
>     └─► ✨ REVEAL: "You have &lt;X&gt; safe to spend." ← aha moment, mid-flow
> ... (Ready screen folded into the reveal — no separate slide)

The status table marks finding #2 ("Setup-first, value-last") ✅, citing the pre-auth
WelcomeScreen. But WelcomeScreen delivers value **claims** — four static bullet props
([WelcomeScreen.js:28-33](src/screens/WelcomeScreen.js)) — which is *telling*, the exact
pattern the same audit criticised in the product tour ("tells instead of shows"). Meanwhile:

- The multi-select Accounts step still exists ([OnboardingScreen.js:211-247](src/screens/OnboardingScreen.js)) — never collapsed to a single balance.
- The separate Ready step still exists ([OnboardingScreen.js:284-298](src/screens/OnboardingScreen.js)) — never folded in.
- **There is no Safe-to-Spend reveal anywhere in onboarding.**

The single highest-leverage item was substituted with a cheaper proxy and closed. Worth
naming explicitly so it isn't marked done twice.

### 🟠 F4 — `onboarding_progress` is not namespaced per user

[OnboardingScreen.js:11](src/screens/OnboardingScreen.js) uses a global key
`'onboarding_progress'`, restored on mount (lines 72-86) with no user scoping — unlike
`lib/cache.js`, which correctly namespaces per user.

Scenario: user A starts onboarding on a shared/demo device and abandons mid-flow; user B
signs up on the same device → **B's onboarding restores A's account selections and typed
balances**, and B's starter accounts are created from A's numbers. Cross-user data bleed
into a brand-new account.

### 🟠 F5 — Sign-up asks for four fields where two would do

[AuthScreen.js:99-106](src/screens/AuthScreen.js): sign-up renders First name + Last name +
Email + Password. Name is collected at the point of maximum drop-off risk, for data used
only in a greeting and a profile row. Also on this screen:

- **No password strength feedback, no minimum enforced client-side, no confirm field.**
  (Matches pending auth-audit items R3/R5.)
- **Raw Supabase error strings** surfaced to the user (`setError(error.message)`) — pending item R6.
- **No Apple Sign-In.** Irrelevant today (Android-only) but a hard App Store requirement the
  moment iOS ships, given Google Sign-In is present.

### 🟡 F6 — Currency spends a whole step to confirm something already auto-detected

[WelcomeScreen.js:43](src/screens/WelcomeScreen.js) already resolves the right currency from
device locale via `guessCurrency`. Step 3 then presents the **full 18-item list with a search
box** as a mandatory step. When the guess is correct — which is most of the time — this is a
pure friction step, and it's a *settings* question asked before any value is delivered.

### 🟡 F7 — Per-step instrumentation fires on exit, not entry, so drop-off is unmeasurable

- [WelcomeScreen.js:66-70](src/screens/WelcomeScreen.js) — `track('welcome_step')` fires inside
  `next()`, i.e. when **leaving** a step. Step 0 (`Intro`) never emits a step event at all.
- [OnboardingScreen.js:129-137](src/screens/OnboardingScreen.js) — same pattern; the first step
  is never recorded as viewed.

So you cannot distinguish "viewed the Accounts step and abandoned" from "never reached it" —
which is the precise question the instrumentation was added to answer. Also missing:
`onboarding_abandon`, and any event correlating the auto-fired `paywall_view{source:'onboarding'}`
to a purchase outcome.

### 🟡 F8 — The pre-auth flow is a one-way door

`finish()` sets `WELCOME_SEEN_KEY` permanently
([WelcomeScreen.js:53-59](src/screens/WelcomeScreen.js)), and the gate only shows
WelcomeScreen when `!welcome.seen` ([RootNavigator.js:566](src/navigation/RootNavigator.js)).
A user who taps "I already have an account" by mistake lands on AuthScreen with **no route back**
to the welcome, permanently. Minor, but it's a dead end with no recovery.

### 🔵 F9 — Sign-up interrupts with a non-actionable modal

[AuthScreen.js:50](src/screens/AuthScreen.js) fires `Alert.alert('Check your email', …)` then
proceeds anyway. The dashboard already has a proper non-blocking verify banner, so this modal
adds an interruption mid-flow without adding information or gating anything. Low priority.

### 🔵 F10 — i18n still absent

Every string in the funnel is hard-coded English, on an explicitly international product.
Deliberately deferred by the user until traction; noted for completeness only, **not**
re-proposed here.

---

## Part 2 — The benchmark: how the best-converting flows are built

Patterns common to the highest-performing consumer-subscription onboardings (Cal AI,
Rocket Money, Noom, Duolingo, Blinkist) and where SafeSpend sits against each:

| Pattern | Best-in-class behaviour | SafeSpend today |
|---|---|---|
| **Value before the wall** | A real, personalized *result* precedes signup/paywall: Cal AI photographs a meal and returns calories; Rocket Money surfaces "we found 3 subscriptions costing $47/mo" before the sale. | ❌ Value **claims** only (4 bullets). Paywall fires before any computed number. |
| **Onboarding as commitment device** | 10–20 fast, low-effort *investment* questions (goals, habits, situation). Counter-intuitively raises conversion via sunk-cost + personalization. | ⚠️ Short (3+3) but the questions are mostly **config** (currency, account types), not investment. Intent chip is the one exception and it's good. |
| **Paywall references the user's own inputs** | "Based on your answers, here's your plan" — restates the stated goal, shows a projection. | ⚠️ Per-source copy exists, but the `onboarding` variant references neither the chosen intent nor any personal number. |
| **Aha = a number the user couldn't compute alone** | The product does visible work. | ⚠️ Correct north-star metric chosen (Safe-to-Spend) — but at first run it equals the balance the user just typed. |
| **Charge transparency** | Explicit trial timeline; no dark patterns. | ✅ **Exceeds standard.** Timeline + real regional prices + honest savings math. |
| **Progressive disclosure** | Minimum now; everything else contextual, later. | ⚠️ Still asks per-account balances for up to 4 accounts up front. |
| **Permission hygiene** | Soft-ask precedes OS prompt; denial recoverable. | ✅ Meets standard. |
| **Social login breadth** | Apple + Google on iOS. | ⚠️ Google only (fine on Android; blocker at iOS launch). |

**The single structural gap:** SafeSpend's onboarding *collects* but never *computes*. Every
input is stored for later; nothing is fed back to the user as insight during the flow. The
product's intelligence — Safe-to-Spend, the forecast, the coach — only becomes non-trivial once
recurring income and bills exist, and onboarding asks for neither.

---

## Part 3 — Recommended redesign

The key insight: **the fix for F2 and the fix for the app's "thin first-run intelligence"
are the same change.** Asking for monthly income and one or two fixed bills during onboarding
(a) produces a genuinely computed Safe-to-Spend number to reveal before the paywall, and
(b) seeds the recurring/bills data that the forecast and coach need in order to say anything
useful on day 1 (per prior audits, the forecast is "flat/meaningless without recurring set up").

```
Pre-auth
 1. Intro          value + social-proof-free positioning          [keep as-is]
 2. Goal           4 intent chips                                 [keep — this one works]
 3. Currency       detected chip + "Change" affordance            [was a full list step]

Auth
 4. Sign up        email + password (+ Google/Apple)              [drop last name]

Onboarding
 5. Main account   "What's in your main account right now?"       [1 input, typed correctly]
 6. Income         "Roughly what comes in each month, and when?"  [NEW — seeds recurring]
 7. Fixed costs    "Your biggest fixed bill?" (rent/loan) + add   [NEW — seeds bills]
     └─► ✨ REVEAL  "You have KSh X safe to spend — about KSh Y/day
                     for the next N days."     ← real computed aha, folds in "Ready"
 8. Alerts         notification + biometric offers                [keep as-is]

 9. Paywall        copy references their intent + the revealed number

Dashboard
     └─ FAB coachmark + intent-tailored checklist                 [keep as-is]
     └─ Optional: "Add your other accounts" contextual prompt     [replaces multi-select]
```

Step count is unchanged (7 → 7 pre-dashboard surfaces) but the *composition* shifts from
five config questions to three investment questions plus a payoff. Crucially, the paywall now
arrives immediately after the app has demonstrably done something for the user.

---

## ✅ Implementation status (2026-07-26, same day)

Everything below shipped except the two items that are genuinely blocked or were
explicitly excluded. Verified with `npm test` (**37/37**, one new regression lock) and
`expo export` (clean, 1701 modules).

| # | Item | Status |
|---|------|--------|
| F1 | Wrong account types | ✅ `ACCOUNT_PRESETS` carry real types; `RootNavigator` passes `a.type`; **`savings` added to `ACCOUNT_TYPES`** so the liquidity distinction is reachable at all; savings hint added to `AccountSheet`. New test proves the old behaviour overstated liquid by **6.8×** and made card debt vanish. |
| F2 | Value after the ask | ✅ **Sequencing fixed, model untouched.** A computed Safe-to-Spend reveal now lands *inside* onboarding, before the paywall fires. Card-up-front + read-only wall are unchanged. |
| F3 | Prior rec not delivered | ✅ Now actually delivered: Accounts multi-select → one liquid primary account; `Ready` folded into the `Reveal`. |
| F4 | Shared progress key | ✅ Namespaced `onboarding_progress:<uid>`; legacy global key deleted on load. |
| F5 | Signup friction | ✅ Two name fields → one "Your name" (split on submit); password strength meter + 8-char minimum **on sign-up only** (existing shorter passwords can still sign in); Supabase errors mapped to friendly copy. |
| F6 | Currency step | ✅ Detected currency is now a one-tap confirm card; the 18-item list only opens on "Change". |
| F7 | Step events on exit | ✅ Both `WelcomeScreen` and `OnboardingScreen` fire on **enter** (incl. the first step); added `onboarding_abandon` (unmount-only, via ref — a naïve `[step]` dep would have logged an abandon per navigation) and `onboarding_skip`. |
| F8 | One-way door | ✅ "← Back to intro" on `AuthScreen`; session-level only, so the intro doesn't reappear on later launches. |
| F9 | Check-email Alert | ✅ Replaced with a persistent inline notice — correct, because when email confirmation is required there's no session and the user stays on the screen. |
| — | Seed real data | ✅ Onboarding now writes a `recurring_transactions` income row + a `bills` row, so the forecast/coach have something to work with on day one. Best-effort; never blocks setup. |
| — | Paywall personalization | ✅ `SOURCE_COPY.onboarding` now references the chosen intent **and** the revealed number. |
| F10 | i18n | ⏸ Deferred by prior user decision. Not re-proposed. |
| T3 #12 | Free transactions before the wall | ⛔ **Excluded — business decision.** Read-only wall stays as-is. |
| T3 #13 | Apple Sign-In | ⛔ **Blocked, not skipped.** Needs an Apple Developer account, an iOS target and `expo-apple-authentication`. Android-only today; must be done before iOS submission. |

### The flow as shipped

```
Pre-auth   Intro → Goal → Currency (confirm chip)
Auth       Name + Email + Password (+ Google) · back-to-intro escape
Onboarding Account → Money → ✨ Reveal → Alerts
Paywall    personalized: their goal + the number they just saw
```

`Reveal` computes through the same `computeAvailableToSpend` the dashboard uses, entirely
from local state — no network, nothing written until the user finishes. If they skip every
input it degrades to the old "You're all set" framing rather than showing a hollow zero.

---

## Part 4 — Prioritized roadmap

### Tier 0 — Bugs (do regardless of any redesign decision; ~1–2 hours)

1. **Fix onboarding account types (F1).** Add `type` to `ACCOUNT_PRESETS`:
   Cash → `'cash'`, Checking Account → `'bank'`, Savings Account → `'savings'`,
   Credit Card → `'credit'`; pass `a.type` through instead of the hardcoded `'bank'`
   at [RootNavigator.js:547](src/navigation/RootNavigator.js). Relabel the balance input to
   **"Amount owed"** for the credit preset, mirroring `AccountSheet`.
2. **Add "Savings" to `ACCOUNT_TYPES`** ([palette.js:7](src/sheets/palette.js)) so the
   liquidity distinction is reachable at all, and existing mis-typed accounts are fixable.
   Without this, fix #1 only helps new accounts.
3. **Namespace `onboarding_progress` per user (F4)** — key it by user id like `lib/cache.js`.
4. **Fix step-view instrumentation (F7)** — fire on step *enter* (including the first step),
   add `onboarding_abandon`.

### Tier 1 — Deliver value before the ask (the conversion lever; ~3–5 days)

5. **Build the income + fixed-cost steps and the reveal screen** (Part 3, steps 6–8),
   computing live via `computeAvailableToSpend`. Fold `Ready` into the reveal.
6. **Collapse the Accounts multi-select to one primary account**, correctly typed; move
   additional accounts to a contextual post-onboarding prompt.
7. **Personalize the onboarding paywall** — reference the chosen intent and the revealed
   number in `SOURCE_COPY.onboarding`.

### Tier 2 — Reduce friction (~1 day)

8. **Currency: confirm, don't choose (F6)** — detected chip + "Change" opens the existing list.
9. **Trim signup (F5)** — last name optional or a single "Name"; add a password strength meter
   and an 8-char minimum; map Supabase errors to friendly copy (closes pending R3/R5/R6).
10. **Drop the "Check your email" Alert (F9)**; the dashboard banner already covers it.
11. **Add a back route from AuthScreen to the welcome (F8).**

### Tier 3 — Strategic, needs a product decision

12. **Let brand-new users log 1–3 transactions before the read-only wall engages.**
    This is the highest-leverage single lever available and it directly contradicts the
    current card-up-front rule, so it's the user's call — but note what the wall currently
    costs: the activation loop, its instrumentation, the FAB coachmark and the checklist's
    core step are all unreachable for non-subscribers, and a user who has never logged
    anything has no felt reason to pay. A capped free allowance (e.g. 3 transactions, or
    48 hours) preserves card-up-front economics while letting the product prove itself.
    Worth an A/B test if remote config ever lands.
13. **Apple Sign-In** before/at iOS launch.
14. **Use intent more aggressively** — it currently changes copy and checklist order; it could
    select which dashboard cards appear and which first-run empty states are shown.

### Metrics to watch once Tier 0 #4 lands

- **Activation rate** = % of sign-ups logging ≥1 transaction in 24h (currently unmeasurable
  for non-subscribers — see F2).
- **Per-step drop-off** across all 7 surfaces, especially Currency (F6) and the paywall.
- **Onboarding → trial-start conversion**, sliced by intent.
- **Time-to-first-computed-number** (target: inside onboarding, pre-paywall).
- **D1/D7 retention** sliced by intent and by whether the reveal was seen.

---

## Appendix — file map

- Pre-auth: [WelcomeScreen.js](src/screens/WelcomeScreen.js), [lib/locale.js](src/lib/locale.js)
- Auth: [AuthScreen.js](src/screens/AuthScreen.js), [AuthContext.js](src/contexts/AuthContext.js)
- Onboarding: [OnboardingScreen.js](src/screens/OnboardingScreen.js)
- Gate + completion + auto-paywall: [RootNavigator.js](src/navigation/RootNavigator.js), [SettingsContext.js](src/contexts/SettingsContext.js)
- Entitlement / read-only wall: [EntitlementContext.js](src/contexts/EntitlementContext.js)
- Paywall: [PaywallScreen.js](src/screens/PaywallScreen.js)
- First-run nudges: [DashboardScreen.js](src/screens/DashboardScreen.js), [Coachmark.js](src/components/Coachmark.js)
- Money math affected by F1: [balances.js](src/lib/balances.js), [available.js](src/lib/available.js), [palette.js](src/sheets/palette.js)
- Instrumentation: [lib/analytics.js](src/lib/analytics.js)
