# SafeSpend Subscription / IAP / Paywall Audit & 10/10 Recommendation

_Audited: 2026-07-10 · mobile app · versionCode 14 / 1.3.2 · RevenueCat + Google Play Billing_

A full teardown of the monetization system — entitlement, the paywall, purchase
flow, and feature gating — benchmarked against how subscription-first apps
(Rocket Money, Copilot, Duolingo, Blinkist) actually convert. It ends with a
prioritized redesign.

---

## Part 0 — The system as it exists today

| Piece | File | Role |
|-------|------|------|
| RC wiring | [revenuecat.js](src/lib/revenuecat.js) | Configure SDK, log in/out, `hasPremiumEntitlement`. Android key present; iOS empty. |
| Entitlement hook | [useSubscription.js](src/hooks/useSubscription.js) | `isPremium = RC entitlement OR Supabase subscriptions(active\|trialing)`; subscribe / restore / cancel / prices / planType. |
| Paywall | [PaywallScreen.js](src/screens/PaywallScreen.js) | Plan picker, localized prices, subscribe/restore/cancel, feature comparison. |
| Plan badge | [useProfileInfo.js](src/hooks/useProfileInfo.js) | Derives a `plan` label for More/Profile (Supabase-first, RC fallback). |
| Entry points | [MoreScreen.js:51](src/screens/MoreScreen.js), [ProfileScreen.js:291](src/screens/ProfileScreen.js) | "Manage subscription" menu rows → paywall. |

> Not to be confused with **[SubscriptionsScreen.js](src/screens/SubscriptionsScreen.js)** / `useSubscriptions` — that's a *budgeting* feature (track your Netflix/Spotify), unrelated to app Premium.

**What's already good:**
- RC + Play Billing correctly wired; configured once at startup, `logIn`/`logOut` follow auth.
- Cross-platform entitlement via an OR of RC and the Supabase table — sensible bridge for web(Paystack)+mobile without a webhook yet.
- Localized Play prices, Restore present, Play-managed cancel deep-links out (store-policy-correct), Terms/Privacy linked.

---

## Part 1 — Findings (ranked by revenue impact)

### 🔴 1. There is no feature gating anywhere — the paywall sells nothing
The comparison table advertises hard limits — **2 accounts, 8 categories, 1 goal, 1 debt, receipt scan, AI insights, forecasting, annual budget, CSV import** all "Premium" — but **not one is enforced in code.** A grep across `AddSheet`, `AccountSheet`, `CategoriesScreen`, `GoalsScreen`, `DebtScreen`, `RecurringScreen`, `BillCalendarScreen` finds zero `isPremium`/limit checks. `isPremium` is consumed only by the paywall itself and a badge in More.

**Free users get 100% of the app.** There is no functional reason to pay. This is the single biggest issue and the true 10/10 blocker — everything else is secondary to it. The good news: the intended tiers already exist (they're literally the paywall's `features` array); they just need to be *enforced*.

### 🔴 2. No contextual paywall triggers
The paywall is reachable **only** by manually tapping More/Profile → "Manage subscription." It never appears at the moment of desire — adding a 3rd account, tapping "Scan receipt", opening the forecast. Best-practice monetization surfaces the paywall exactly when a free user hits a wall. Combined with #1 (no walls exist), the paywall is a passive dead-end screen almost no one will see. Conversion on an unseen paywall is ~0.

### 🟠 3. Entitlement has three code paths that can disagree (split-brain)
- `useSubscription`: `RC OR Supabase(active|trialing)` → exposes `isTrialing`, `planType`.
- `useProfileInfo`: Supabase-first (`active`→"Premium · plan", `trialing`→"Free trial"), RC only as a fallback that collapses to a bare "Premium" (loses trial/plan nuance).
- No shared context — every screen re-fetches `getCustomerInfo()` independently.

Concrete divergence: a Google-Play **trial** user reads as `isTrialing` on the paywall but shows plain **"Premium"** (no trial label) in Profile. Gating (once it exists), badges, and the paywall must never disagree → they need **one source of truth**.

### 🟠 4. The revenue surface fires zero analytics
We just shipped [analytics.js](src/lib/analytics.js), yet the paywall emits **no events** — no paywall view, plan select, checkout start, purchase success/cancel/fail, or restore. RevenueCat's dashboard covers store-side conversion, but the **feature→paywall→purchase** funnel (which trigger drove the sale) is invisible without app events. You can't optimize monetization you can't see.

### 🟠 5. Trial & discount copy is hardcoded and can lie
"Save 25%", "7-day free trial", "then $89.99/year", and the `$89.99`/`$9.99` fallbacks are hardcoded in JS, while the real trial/intro offer lives in Play Console. If they drift, the paywall misrepresents the offer — a **Play policy risk**. Worse, **trial eligibility isn't checked**: RevenueCat exposes intro/free-trial eligibility per product, but a returning user who already burned their trial still sees "Start 7-day free trial." Read trial/offer details from the RC product and gate the trial label on eligibility.

### 🟠 6. No server-side entitlement truth (no RC → Supabase webhook)
Entitlement is client-trusted: the RC SDK on-device OR a Supabase row. There's no RevenueCat **webhook** writing purchases back to Supabase, so (a) the **web app can't see mobile purchases**, and (b) entitlement is tamperable. For 10/10, an RC webhook → `subscriptions`/`entitlements` table makes Supabase the cross-platform server truth (and lets the OR in `useSubscription` collapse to one trustworthy read).

### 🟡 7. Purchase success is a bare Alert — the highest-value moment is wasted
On success: `Alert.alert("You're all set")`. No celebration (the app already has a [Confetti](src/components/Confetti.js) component used for goals!), no "here's what you just unlocked," no navigation into a newly-unlocked feature. The moment a user pays is the best moment to reinforce the decision and drive activation of premium features.

### 🟡 8. Pending / deferred purchases are treated as failures
`subscribe()` returns `ok: hasPremiumEntitlement(info)` immediately after `purchasePackage`. Google Play "slow" payments (bank approval, family approval) return **pending** — entitlement isn't active yet, so the code reports failure even though the purchase may complete minutes later. Should detect pending state and show "we'll unlock Premium once your payment clears," relying on the `customerInfo` update listener.

### 🟡 9. Restore is buried; only on the paywall, only for non-premium
Restore is a small text link shown solely to non-premium users on the paywall. Both stores expect an easily discoverable restore. Surface it in Profile/More too, and offer it automatically if an entitlement check fails after a known purchase.

### 🟡 10. No trial offer in the onboarding funnel
The paywall is entirely passive. Finance apps convert best by presenting a trial at peak motivation — the end of onboarding, tied to the intent the user just picked ("Start your 7-day trial to unlock forecasting for your debt payoff"). Nothing surfaces Premium during the funnel.

### 🔵 11. Paywall polish gaps
- No loading skeleton — prices pop from USD placeholders to localized Play prices (a KES user briefly sees `$89.99`).
- Offerings-load failure → generic "not available," no retry.
- Plan-picker `Pressable`s lack `accessibilityRole="radio"`/state (the onboarding pickers have them).

### 🔵 12. iOS not wired
iOS key is `""` (Android-only). The paywall copy ("Billed through Google Play") and the cancel deep-link are Android-specific. Fine for an Android-first launch, but needs platform-awareness + an App Store path before iOS.

---

## ✅ Implementation status (v1.4.0 / versionCode 15)

Model chosen: **7-day store-managed (Play intro-offer) free trial → read-only wall.**
`canWrite = isPremium` (the trial counts as premium). No permanent free tier; reads
and export always free. Trial length + intro offer are a **Play Console config**, not code.

| # | Finding | Status |
|---|---------|--------|
| 1 | No feature gating | ✅ Read-only wall: `AddSheet` + `FormSheet` bounce to the paywall when `!canWrite` (covers transactions, accounts, bills, budgets, categories, debts, goals, transfers, deposits, recurring); FAB, repeat-last, and mark-paid go through `requireWrite`. |
| 2 | No contextual triggers | ✅ Every blocked write opens the paywall with a `source` (add_txn, scan, mark_paid, edit, read_only_banner, onboarding, settings). |
| 3 | Split-brain entitlement | ✅ One `EntitlementProvider` — paywall, gating, and the profile badge all read it. `useSubscription` is now a shim; `useProfileInfo` consumes the provider. |
| 4 | No paywall analytics | ✅ `paywall_view`, `plan_select`, `checkout_start`, `purchase_success/pending/cancel/fail`, `restore` — through the analytics layer. |
| 5 | Trial copy could lie | ✅ `trialEligible` (from RC purchase history) gates all "free trial" copy; ineligible users see "Upgrade" instead. |
| 7 | Bare-Alert success | ✅ Confetti + "Welcome to Premium" celebration state with a "Start using Premium" CTA. |
| 8 | Pending purchases = failure | ✅ `subscribe()` returns `pending`; paywall shows a "payment processing" message and relies on the customerInfo listener. |
| 10 | No trial offer in funnel | ✅ Post-onboarding auto-present (source `onboarding`), fired once. |
| 11 | Polish | ✅ Plan picker has `radio` roles; success/pending handled. (Price-placeholder currency + retry still minor.) |
| — | Read-only affordance | ✅ Dashboard `ReadOnlyBanner` (trial-aware CTA) + gated write buttons route to the paywall. |

**Deliberately left open (flagged):** **deletes and pause-toggles** on existing
records are *not* gated — a read-only user can still remove/clean up their own
data (humane, and it doesn't affect revenue). Creates/edits — the value-add
writes — are fully walled.

**Still pending (Tier 2, backend / config):**
- **Finding 6 — RC → Supabase webhook** for server-truth entitlement + cross-platform (web sees mobile purchases). Backend/web-agent task.
- **Play Console**: configure the subscription products + the 7-day intro offer + finalize the RevenueCat offering (the "products pending" item). Until then, offerings are empty → the paywall shows placeholder prices and `subscribe()` reports "not available."
- **Finding 12 — iOS**: key empty; Android-only for now.

## Part 2 — The 10/10 target

Principles, in order:

1. **The free tier must have real walls.** Enforce the tiers the paywall already advertises. No gating = no business.
2. **Sell at the moment of desire.** Trigger the paywall contextually when a free user hits a wall, with that specific feature highlighted.
3. **One entitlement source of truth.** A single `EntitlementProvider` consumed by gating, badges, and the paywall.
4. **Measure the money.** Paywall + purchase funnel events through the analytics layer we already built.
5. **Never misrepresent the offer.** Trial/price/eligibility read live from RevenueCat; server-verified via webhook.
6. **Celebrate the purchase.** Turn the highest-value moment into activation, not an Alert.

### Declared tiers (from the paywall — just need enforcement)
| Feature | Free | Premium |
|---|---|---|
| Accounts | 2 | Unlimited |
| Categories | 8 | Unlimited |
| Goals / Debts | 1 each | Unlimited |
| Receipt scan (AI) | ✗ | ✓ |
| AI categorization & insights | ✗ | ✓ |
| Cash-flow forecast | ✗ | ✓ |
| Annual budget & analytics | ✗ | ✓ |
| CSV / Excel import | ✗ | ✓ |
| Bill reminders, export/backup | ✓ | ✓ |

---

## Part 3 — Roadmap

### Tier 1 — Make monetization actually function (do first)
1. **`EntitlementProvider` context** — one place resolves RC + Supabase into `{ isPremium, isTrialing, plan, limits, gate(feature) }`; replace the three ad-hoc paths. Everything else consumes it.
2. **Enforce the declared limits** — a `gate('accounts'|'categories'|'goals'|'debts'|'scan'|'forecast'|'annualBudget'|'import')` helper + a reusable `usePaywall()` that opens the paywall with the blocking feature highlighted. Wire into AddSheet/AccountSheet/Categories/Goals/Debt/receipt-scan/forecast/annual/import.
3. **Contextual paywall presentation** — the paywall accepts a `reason`/`feature` param and leads with it ("Unlimited accounts is a Premium feature").
4. **Paywall analytics** — `paywall_view {source}`, `plan_select`, `checkout_start`, `purchase_success/‑cancel/‑fail`, `restore`. Thread `source` from each contextual trigger.

### Tier 2 — Trust & correctness
5. **Trial eligibility + live offer details from RC** — no hardcoded/lying trial copy; hide the trial label for ineligible users.
6. **RevenueCat webhook → Supabase** — server-truth entitlement, cross-platform (web sees mobile purchases).
7. **Purchase celebration** — reuse Confetti + a short "what you unlocked" sheet on success; route into a newly-unlocked feature.
8. **Handle pending/deferred purchases** — pending state messaging, resolve via the `customerInfo` listener.

### Tier 3 — Growth
9. **Onboarding trial offer** — an optional final step tied to the user's intent.
10. **Restore in Profile/More** + auto-restore on failed entitlement check.
11. **Paywall loading skeleton, retry, a11y roles**, price-placeholder in the user's currency.
12. **A/B the paywall** (annual-default vs monthly-default, trial length, copy) once events exist; **win-back** offer for churned users.

### Metrics to watch once instrumented
- **Free→paid conversion**, sliced by trigger `source` (which wall sells best).
- **Paywall view→checkout→purchase** funnel; **trial→paid** conversion.
- **Trial start rate** from onboarding vs. contextual triggers.
- **Involuntary churn** (pending/failed payments) and **restore success rate**.

---

## Appendix — the one product decision needed
Tier 1 assumes the tier limits in the table above (which are what the paywall
already promises). Confirm those numbers — especially **2 accounts / 8 categories
/ 1 goal / 1 debt** — before enforcement ships, since they directly shape the
free experience and existing free users may already exceed them (needs a
grandfathering decision: block *new* creation over the limit, don't delete
existing data).
