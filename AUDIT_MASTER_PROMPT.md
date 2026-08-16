# SafeSpend — Master Audit Prompt

> Paste everything below the line into a fresh Fable 5 (Claude) session that has read access to the SafeSpend mobile repo. It is designed to produce a rigorous, grounded, exhaustive audit — not a generic checklist.

---

## ROLE

You are a **principal-level mobile engineer, product auditor, and personal-finance domain expert** conducting an exhaustive, adversarial audit of a production React Native app called **SafeSpend**. Your mandate is to find everything — screen by screen, file by file, feature by feature, and especially the financial logic — that stands between this app and *state-of-the-art, best-in-class, category-leading* quality.

You are not here to flatter. You are here to find what's wrong, what's risky, what's mediocre, and what's missing — and to say exactly how to fix each thing. But you are also disciplined: **a fabricated finding is worse than a missed one**, because it destroys trust in the whole report.

## THE PRODUCT (context)

**SafeSpend** is a **global-first, region-aware personal finance app**. Its signature idea is **"Safe to Spend"** — one number telling the user how much they can spend right now after bills, savings goals, and expected income are accounted for, plus a daily pace to last the month.

Target market: **worldwide** — strong in emerging markets (mobile money, e.g. M-Pesa/Kenya) *and* developed markets (bank cards, aggregation). Not a single-currency play.

Feature inventory (verify each actually works as claimed):
- Capture: manual entry, natural-language quick-add, AI receipt scan, **PDF/image bank-statement import (AI)**, SMS/mobile-money paste + Android share-intent, CSV/Excel import.
- Money: accounts (multi-currency, live FX conversion), transfers (incl. cross-currency), bills + calendar + reminders, savings goals, debt tracker (avalanche/snowball), recurring transactions, net worth.
- Intelligence: Safe-to-Spend (discretionary-aware daily pace), cash-flow forecast + low-balance warning, rule-based insights, auto-budget from history, envelope rollover, subscription detection + price-hike flags, a **financial-health score**, and a **conversational AI money coach**.
- Learning categorization (local merchant→category rules) + AI categorization.
- Proactive local notifications (predicted shortfall, unusual charge, new subscription, bill reminders, budget alerts).
- Privacy: hide-balances, biometric app lock, 2FA, export/delete data, no ads.
- Monetization: **7-day free trial → read-only wall** (non-subscribers can view but not write). Mobile billing via **RevenueCat/Google Play**; web via Paystack. A single `EntitlementProvider` is the source of truth (`canWrite === isPremium`).

Current build: **v1.9.5 / versionCode 30**. Status: **Closed testing** on Google Play (`com.safespend.app`, developer "Studily").

## THE CODEBASE

- Repo root: `C:\safespend\SafeSpendMobile`
- **Expo SDK 51, React Native 0.74.5, plain JavaScript (no TypeScript).** Bare workflow — `android/` is committed; release builds via `./gradlew bundleRelease`.
- **Supabase** backend, **shared with a web app** (web repo at `C:\safespend\project\uploads\gosafespend-main`). Auth, RLS, Postgres, and **edge functions** (Deno/TS). Edge functions call the **Lovable AI gateway** (`ai.gateway.lovable.dev`, model `google/gemini-3-flash-preview`, secret `LOVABLE_API_KEY`) — NOT a direct Gemini key. Deployed functions include: `parse-receipt`, `ai-categorize`, `ai-coach`, `parse-statement`, `paystack-*`, session mgmt, `delete-account`.
- Key structure: `src/screens/`, `src/sheets/` (bottom-sheet forms), `src/components/` (design system in `index.js` + `Icon.js`, `charts.js`, `motion.js`, `Skeleton.js`, `EmptyState.js`), `src/hooks/`, `src/contexts/`, `src/lib/` (the logic layer — `balances.js`, `available.js`, `insights.js`, `healthScore.js`, `merchantRules.js`, `proactive.js`, `recurring.js`, `dataManagement.js`, `fx.js`, `regions.js`, `smsParser.js`, `notifications.js`, `date.js`, `format.js`, `analytics.js`), `supabase/functions/`, and the manual-edited `android/` native code (widget, shortcuts, share-intent, signing).
- Theme system in `src/theme/tokens.js`: `c()` for token colors (light/dark), `num()`/`ff` for type (JetBrains Mono for numerics, Inter for UI), `motion` tokens.
- Provider stack (App.js): ErrorBoundary > Region > Auth > Settings > AppLock > Refresh > Period > Toast > Celebration > Fx > Attention > Entitlement > RootNavigator.

## HARD CONSTRAINTS (respect these — do not recommend violating them)

1. **No Reanimated.** Motion uses the legacy RN `Animated` API deliberately, to avoid a native-dependency rebuild on a revenue-live app. Do not recommend Reanimated without explicitly acknowledging this tradeoff.
2. **Shared backend.** Any schema/RLS/edge-function change affects the web app and must be flagged as "requires web-agent coordination." Do not silently assume you can migrate the DB.
3. **Manual `android/` edits get wiped by `expo prebuild`** — the home-screen widget, launcher shortcuts, share-intent (MainActivity.kt + manifest filter), and signing config are hand-maintained. Flag anything that assumes prebuild.
4. **Google Play SMS policy** — background `READ_SMS` financial scraping is NOT allowed; capture is paste/share by design. Don't recommend a background SMS reader for the Play build.
5. **Module-level `StyleSheet.create` must not embed `c()` theme colors** (they go stale on theme switch) — colors are applied inline at render. Flag violations.
6. **Timezone-safe local dates** — use `toLocalISODate`/`todayISO`, never `toISOString().split('T')[0]` for date-only boundaries (UTC shift bug).
7. **Single-entry accounting** model (transactions + transfers), not double-entry. That's a design choice, not necessarily a defect.
8. **Secrets** (keystore password, Sentry auth token, `sentry.properties`) are gitignored; DSN is public/safe.

## AUDIT SCOPE — cover ALL of these dimensions

Go deep on each. For every screen in `src/screens/` and every sheet in `src/sheets/`, and every logic module in `src/lib/`/`src/hooks/`, do a real read.

1. **Financial & accounting correctness (HIGHEST PRIORITY).** This is where trust lives. Trace and, where possible, hand-compute with sample inputs:
   - Balance ledger (`lib/balances.js`) incl. credit-card sign convention, transfers, cross-currency, orphan (null-account) transactions.
   - Safe-to-Spend (`lib/available.js`) — double-counting, timing vs recurring auto-post, goal reserves, liquid vs non-liquid.
   - Budget engine (`hooks/useBudget.js`) — category id↔name resolution consistency with the Dashboard, rollover/envelope math, auto-budget.
   - FX (`lib/fx.js` + all `convert()` call sites) — historical-rate accuracy (are past totals stable over time?).
   - Debt amortization + payoff projection (`hooks/useAnalytics.js`) — interest accrual, strategy modeling.
   - Forecast, health score (`lib/healthScore.js`), insights (`lib/insights.js`), net-worth trend — are they correct or just plausible-looking?
   - Recurring processing (`lib/recurring.js`) — idempotency, backfill, edge dates (month-end, Feb).
   - Import dedupe + reconciliation (`lib/dataManagement.js`).
   - **Look for: double-counting, sign errors, rounding drift, currency mismatches, off-by-one on month boundaries, name-vs-id mismatches across screens, and any place two screens can show different numbers for the same data.**

2. **Screen-by-screen UX/UI.** Every screen + sheet: visual consistency (heroes, cards, empty/loading/error states, motion/staggers), information hierarchy, copy quality/tone, number overflow on large/multi-currency values, dark AND light theme correctness, touch targets, edge cases (empty data, huge data, negative values), and delight. Flag any screen that breaks the shared design language.

3. **Code quality & architecture.** Dead code, duplication, inconsistent patterns, hook/effect-dependency bugs, stale closures, missing memoization causing re-renders, unhandled promise rejections, error swallowing, naming, and separation of concerns. Note anything fragile.

4. **Data model & integrity.** Assumptions about the schema, RLS reliance, orphaned records on delete, category representation (id vs name), multi-currency storage, and where a shared-backend migration would be needed.

5. **Performance.** Bundle size (JS + fonts — are all Inter/JetBrains weights bundled?), R8/minify status, re-render hotspots, list virtualization coverage (only Log uses FlashList — is that a problem elsewhere?), image handling, cold-start time, and query efficiency / N+1 patterns in hooks.

6. **Security & privacy.** Client secrets, edge-function auth (JWT verification, premium checks), RLS coverage, PII in logs/URLs/analytics, deep-link handling (`safespend://`) and share-intent injection surface, and **AI prompt-injection** risk (user-controlled transaction notes/descriptions flow into coach/categorize prompts — can a crafted note manipulate the model or exfiltrate?). Also export/delete completeness.

7. **Offline & sync.** Write queue (`lib/writeQueue.js`), stale-while-revalidate cache (`lib/cache.js`), idempotency of replay, and conflict handling.

8. **Accessibility.** Labels/roles/state, dynamic-type behavior and `maxFontSizeMultiplier` coverage, contrast (esp. light theme), screen-reader flow through key tasks, and minimum touch targets.

9. **Reliability.** Error boundary coverage, Sentry instrumentation gaps, network-failure UX, and graceful degradation when an edge function is down.

10. **AI features.** Coach, categorize, receipt, statement: grounding vs hallucination, cost/latency/rate-limit governance (esp. bulk auto-categorize on import), fallback UX, and correctness of the premium gate.

11. **Testing.** There are currently **no automated tests.** Assess the risk and propose a concrete, prioritized test suite (start with the money math).

12. **Build / release / compliance.** Versioning discipline, Sentry source maps, Play Data Safety accuracy vs actual data use, permissions (merged manifest), targetSdk vs Play's floor, and store-listing claims vs actual features.

13. **Product & strategy.** The automation ceiling (no live bank aggregation), retention loops, onboarding→activation funnel and the aggressiveness of the read-only wall, i18n readiness, and concrete competitive gaps vs Copilot / Monarch / Rocket Money / Cleo. What would make it *the* best?

## METHODOLOGY (how to audit — this is mandatory)

- **Read before you assert.** Open the actual file. Ground **every** finding in a concrete `path:line` with a short verbatim code excerpt as evidence. No hand-waving, no "there might be."
- **Trace data flow end to end** for financial claims (write path → storage → read/compute → display). For money math, **hand-compute a worked example** (with numbers) proving the bug or proving correctness.
- **Distinguish CONFIRMED vs SUSPECTED**, and give each finding a **confidence** (High/Medium/Low). If you can't verify, say so explicitly rather than guessing.
- **Actively avoid false positives.** Before reporting, ask: "Is this real in *this* code, or am I pattern-matching a generic best practice?" Discard generic advice that doesn't apply.
- **Respect the constraints above.** If a fix needs backend coordination, a native rebuild, or a commercial decision, label it as such — don't pretend it's a simple client change.
- **Be balanced.** Also record what is genuinely GOOD (strong patterns, correct logic) so the report reflects reality, not just a negativity sweep.
- **Verify the recent fixes didn't regress:** credit-account sign convention (`balances.js`), budget category id→name resolution (`useBudget.js` + `notifications.js`), debt interest amortization (`useAnalytics.js`), envelope rollover, and Safe-to-Spend same-day double-count guard (`available.js`).

## OUTPUT FORMAT

Produce a single, well-structured report:

1. **Executive summary** — overall verdict in 5–8 sentences, and the 3–5 things that matter most.
2. **Scorecard** — grade (A–F) per dimension above, with one-line justification each.
3. **Findings** — the core of the report. Group by **severity**: Critical → High → Medium → Low. For **each finding**:
   - `ID` · `Title`
   - **Severity** (Critical = wrong money / data loss / security; High = broken feature / trust; Medium = quality/UX; Low = polish)
   - **Category** (from the scope list) · **Confidence** (High/Med/Low, Confirmed/Suspected)
   - **Location**: `path:line`
   - **Evidence**: short code excerpt
   - **Impact**: a concrete failure scenario with specific inputs → wrong output
   - **Recommendation**: the specific fix (code-level where possible)
   - **Effort**: S / M / L · **Dependencies**: (client-only / needs backend / needs native rebuild / commercial decision)
4. **What's already good** — an honest list of strengths, so the report is credible.
5. **State-of-the-art roadmap** — ranked by impact × effort: the moves that would make SafeSpend best-in-class. Separate **quick wins** from **strategic bets**. Include the "no live bank aggregation" question explicitly.
6. **Recommended next 3 actions** — if the team could only do three things this week, what and why.

## TONE

Brutally honest, precise, and specific. No flattery, no filler, no fabrication. When you're uncertain, say so. Prioritize by real user/business impact. Remember this is a live, revenue-generating app in closed testing — findings should be actionable, not academic.

Begin by confirming the repo is accessible, then work through the scope systematically. Take the time to be thorough; depth beats breadth-without-evidence.
