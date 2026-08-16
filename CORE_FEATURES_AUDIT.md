# SafeSpend — Core Financial Engine Audit & Cutting-Edge Roadmap

_Audited: 2026-07-10 · v1.5.3 · the actual money features, benchmarked against the 2026 market_

The previous audits covered the shell (onboarding, subscriptions, motion,
production-readiness). This one is about **what the app does with money** — the
engine — and what would move it from "a well-crafted manual tracker" to
"cutting-edge." The craftsmanship is genuinely high. The gap to market leaders
(Copilot, Monarch, Rocket Money, Cleo) is almost entirely **automation and
intelligence**, not UI.

## The one-sentence verdict
**SafeSpend is a beautiful manual-entry tracker with a solid Safe-to-Spend idea
and thin intelligence on top.** Every number depends on the user hand-entering
(or photographing) each transaction, and the "smart" layers — forecast, insights,
categorization — are simple heuristics. Closing that is the whole game.

---

## Part 0 — What the engine actually is today (grounded)
| Capability | How it works now | File |
|---|---|---|
| **Transaction capture** | 100% manual: type it, natural-language quick-add, or AI receipt scan. **No bank sync, no SMS/M-Pesa capture.** | AddSheet, `nlparse.js`, `parse-receipt` |
| **Safe-to-Spend** | `liquid + expectedIncome − unpaidBills − goalContribs`, monthly, static | `available.js` |
| **Forecast** | Straight-line 6-month net-worth projection from **recurring + bills only** (ignores real spending history) | `useForecast.js` |
| **Insights** | 4 fixed rules (savings rate, over-budget, top-category dominance) | `insights.js` |
| **Categorization** | AI suggestion **on manual tap only** (Premium); not automatic, doesn't learn | `ai-categorize` |
| **Budgets** | Flat monthly category limits; **no rollover, no auto-budget, no groups** | `useBudget.js` |
| **Subscriptions** | A tracker you **fill in by hand** — no detection from spending | `useSubscriptions.js` |
| **NL parse** | Client heuristic: amount + income/expense + note. No category/date/account. | `nlparse.js` |

Everything downstream (dashboard, budgets, reports, net worth) is correct and
well-built — but only as good as the manual data feeding it.

---

## Part 1 — The defining gap: manual entry is the ceiling
The #1 reason people abandon finance apps is **the effort of logging**. Market
leaders removed it a decade ago via bank aggregation. SafeSpend hasn't — which
caps retention no matter how nice the UI is. **Automatic transaction capture is
the single highest-leverage thing on this list.** But the *right* form of it is
market-specific, and here SafeSpend has an unusual advantage:

### 🌍 The move: region-aware automatic capture (global-first, not one market)
The product serves the **global** market, so auto-capture can't be a single
integration — it must be a **pluggable layer that detects the user's country and
picks the best method for their region.** No single rail is global; the right
answer is a registry:

| Region | Best auto-capture | Notes |
|---|---|---|
| Kenya / much of Africa | **SMS parsing** (M-Pesa, MTN MoMo, bank alerts) | Structured txn SMS; incumbents (Plaid) don't cover this |
| India / SE Asia | **SMS parsing** (bank/UPI alerts) | SMS transaction alerts are universal here |
| US / Canada | **Plaid** aggregation | Open-banking mature |
| UK / EU | **TrueLayer / GoCardless / Salt Edge** | PSD2 open banking |
| Nigeria / SA | **Mono / Okra / Stitch** | African open-finance APIs |
| LATAM | **Belvo** | Regional aggregator |
| Anywhere / fallback | Manual + **receipt scan** + **email-receipt parsing** | Always available |

**Two structural insights:**
1. **SMS parsing is the emerging-markets pillar** and something the global
   incumbents *structurally can't* do (they rely on aggregators that don't cover
   these regions). It's a moat across Africa + South Asia — a huge share of the
   global under-served market.
2. **Aggregation is the developed-markets pillar.** You'll want it eventually for
   the US/EU, but it's per-API cost + heavier integration.

**Recommendation:** build a **region-aware capture abstraction** first (see below),
then ship capture *modules* in order of reach-per-effort — **SMS parsing first**
(covers the most countries for the least cost and is the differentiator), aggregator
adapters where open banking is strong, manual/receipt/email everywhere as fallback.

### The global-first architecture (everything must be region/context-aware)
This is the foundation the user is asking for — build it once, and every feature
below inherits it:
- **User `country` / `region`** — detected from device locale/SIM at onboarding
  (you already locale-default the currency), confirmable and changeable.
- **A capability registry** — `region → { captureMethods[], defaults, currency,
  date/pay conventions }`. The UI offers the *right* option per country ("Turn on
  SMS auto-capture" vs "Connect your bank" vs "Scan receipts").
- **A pluggable `TransactionSource` interface** with implementations: `SmsSource`,
  `AggregatorSource` (Plaid/Mono/Belvo/… adapters), `ReceiptSource`, `EmailSource`,
  `ManualSource`. New regions = new adapters, not app rewrites.
- **Config-driven, server-updatable SMS parsers** — a library of per-sender/per-country
  templates (sender id + message pattern → fields). Served from the backend so a
  **new bank format ships without an app update** — critical for scaling across
  countries.
- **Region/currency/locale context flows into everything downstream** —
  categorization (merchant patterns differ by country), insights & the AI coach
  (local currency, context, and eventually local language via i18n), pay-cycle and
  month conventions, even which categories are shown by default.

---

## Part 2 — Findings on each intelligence layer

### 🔴 1. Safe-to-Spend ignores your actual spending
`available.js` subtracts **bills + goal contributions** but not your **typical
discretionary spend** (groceries, transport, eating out). So it overstates what's
truly safe. Cutting-edge Safe-to-Spend (Simple's original, Copilot) forecasts
*expected* variable spend from history and expresses it as a **daily/weekly pace**
("~KSh 1,800/day left for 12 days"). Also: it treats **every positive-balance
account as liquid** — a savings/goal account inflates the number. It should exclude
non-liquid/earmarked balances.

### 🔴 2. The forecast is a straight line that ignores reality
`useForecast.js` projects net worth using **only recurring + bills** × a flat
monthly net. A user who hasn't set up recurring items gets a flat, meaningless
line — and nobody's real spending is a straight line. Leaders forecast from
**historical averages + known recurring + scheduled bills**, show **confidence
bands**, and warn **"you'll dip below KSh X around the 24th"** with a low-balance
alert. This should be a real cash-flow model, not a multiplier.

### 🟠 3. Insights are 4 static rules — not intelligence
`insights.js` is fine but shallow. Missing the things that make an app feel smart:
**anomaly detection** ("dining is 60% above your 3-month average"), **month-over-
month trends**, **predicted month-end position**, **"found money"** (a subscription
you forgot), **cash-flow warnings**, and **personalized, LLM-written** narratives
over the user's own data. You already run Gemini edge functions — an **insights
generator** is a natural next function.

### 🟠 4. Categorization is manual and doesn't learn
`ai-categorize` only fires when the user **taps** a button, and it's Premium-gated.
It should **auto-suggest on every entry**, **learn from corrections**, and support
**rules** ("Uber → Transport", "Naivas → Groceries"). Auto-capture (Part 1) makes
this essential — you can't hand-categorize an automatic feed.

### 🟠 5. Subscriptions are hand-entered — the opposite of Rocket Money
The Subscriptions screen makes users **type in** their Netflix/Spotify. Rocket
Money's flagship feature is **detecting** recurring merchants from the transaction
feed, flagging **price hikes**, and surfacing **forgotten subscriptions**. With
auto-capture, this becomes automatic and is one of the most-loved features in the
category.

### 🟡 6. Budgeting is basic (flat monthly limits)
No **rollover** ("I spent less on transport, roll it forward"), no **auto-budgets**
suggested from spending history, no **category groups**, no **zero-based / envelope**
option (YNAB's whole thesis). At minimum: suggest budgets from the last 3 months,
and offer rollover.

### 🟡 7. No conversational / coaching layer
No way to **ask** the app anything. Cleo and Copilot's assistant let users ask
"can I afford a KSh 20,000 trip?", "where did my money go this month?", "how do I
hit my emergency fund faster?" — answered over their real data. With Gemini already
wired, an **AI money coach** (grounded in the user's aggregates via a tool/RAG edge
function) is a headline, on-trend differentiator.

### 🔵 8. Gaps that round out "complete finance app"
- **Round-ups / automated saving** into goals (spare-change).
- **Financial-health score** (a single trending number, Rocket-Money style).
- **Shared / household** budgets (Monarch's edge) — later.
- **Investment / asset price tracking** in net worth (stocks/crypto) — lower priority for the KES market.

---

## Part 3 — The cutting-edge roadmap (ranked by impact × market-fit)

### Tier 0 — The region/context foundation (build first; everything inherits it)
0. **Region-aware layer**: user `country`/`region` (detected + confirmable), a
   **capability registry**, a pluggable **`TransactionSource`** abstraction, and
   **server-updatable SMS-parser configs**. Thread region/currency/locale into
   categorization, insights, and the coach. Without this, auto-capture becomes a
   pile of country-specific hacks; with it, each new market is a config/adapter.

   ✅ **Started — foundation shipped in v1.6.0 / vc20:**
   - [`lib/regions.js`](src/lib/regions.js) — capability registry: `CAPTURE_METHODS`
     (manual/receipt = available; sms/aggregator/email = coming-soon) + per-country
     `REGION_CONFIG` (Africa mobile-money, India/SEA SMS, US/CA/EU/UK aggregation, EU
     shared profile, global fallback) → `resolveRegion` / `captureMethodsFor`.
   - [`contexts/RegionContext.js`](src/contexts/RegionContext.js) — `RegionProvider`/`useRegion`,
     detects country from device locale, overridable + persisted (`pref_country`), mounted app-wide.
   - [`lib/transactionSources.js`](src/lib/transactionSources.js) — pluggable `TransactionSource`
     registry (seeded from the catalog; real SMS/aggregator sources slot in later).
   - **Region context now flows into the AI:** `country` (+ currency) passed to `ai-categorize`
     and `parse-receipt` for region-aware suggestions.
   - _Follow-ups: a country-picker + "auto-capture options" UI surface (Tier 1 UI);
     sync `country` to `user_settings` for cross-device/web parity (needs backend coordination)._

### Tier 1 — Remove the manual ceiling (the retention unlock), region by region
1. **SMS auto-capture module** (first `TransactionSource`) — on-device parsing,
   consent flow, config-driven per-country/sender templates, a **review/confirm
   inbox**, dedupe vs. manual entries. Ship the highest-reach country packs first
   (M-Pesa/KE, bank+UPI/IN, MoMo/West Africa…). *The differentiator global incumbents
   can't match.*

   ✅ **Compliant core shipped in v1.8.0 / vc23** (Play-safe; background auto-read is a
   separate gated step — see below):
   - [`lib/smsParser.js`](src/lib/smsParser.js) — the reusable parser engine. Recognises
     M-Pesa (send/receive/paybill/withdraw), generic mobile-money, and bank debit/credit
     alerts → `{ amount, currency, type, counterparty, note, balance, ref }`. Currency
     auto-detected from the message; tested against real formats.
   - [`sheets/ImportMessageSheet.js`](src/sheets/ImportMessageSheet.js) — **paste (or share)
     a transaction message → parse → review → save.** Built on FormSheet (inherits the
     read-only subscription gate); mirrors the AddSheet insert (+ offline queue).
   - Registry: `import_message` capture method is now **available everywhere**; the More
     "Ways to add money" card row opens it. `sms` (full auto-read) stays coming-soon.
   - **Why paste/share, not `READ_SMS`:** Google Play only approves a narrow set of SMS
     use cases and **financial-SMS parsing is not one of them** — a background scraper risks
     the whole app (with live billing) being pulled. Paste/share needs no SMS permission
     (the user brings each message), so it's 100% compliant and ships today. The same parser
     is ready for full auto-read *if/when* a distribution/compliance path is chosen.
   - ✅ **Share-intent shipped in v1.8.1 / vc24:** SafeSpend now appears in Android's share
     sheet for text — **Messages → Share → SafeSpend** opens the Import sheet **prefilled and
     auto-parsed**, one tap to save. Implemented with **no third-party native module**:
     `MainActivity.kt` rewrites the `ACTION_SEND` `text/plain` intent into the app's existing
     `safespend://message?text=…` deep-link channel (manifest SEND filter added), which the
     TabsScreen handler routes into a global `ImportMessageSheet`. Still 100% Play-compliant.
   - _Only remaining, behind a deliberate decision: background `READ_SMS` auto-read (off-Play
     distribution or an approved Play declaration) + a review inbox + dedupe._
2. **Auto-categorization by default + learning + region-aware rules** — so the
   auto-feed lands in the right buckets without work.
3. **Automatic recurring/subscription detection** from the feed (+ price-hike &
   forgotten-sub alerts).
4. **Aggregator adapters** where open banking is strong (Plaid US/CA, TrueLayer EU/UK,
   Mono/Stitch Africa, Belvo LATAM) — added as `AggregatorSource` implementations.

### Tier 2 — Make the intelligence actually intelligent
4. **Real cash-flow forecast** (history + recurring + bills, confidence band,
   low-balance "you'll dip below X on the 24th" alerts).
5. **Smarter Safe-to-Spend** (forecast discretionary spend → daily/weekly pace;
   exclude non-liquid accounts).
6. **Proactive insight engine** (anomalies, trends, predicted month-end, LLM
   narratives) — a Gemini `generate-insights` edge function.

   ✅ **Shipped in v1.7.0 / vc22 (rule-based; LLM narratives still a follow-up):**
   - **Safe-to-Spend v2** — `balances.liquidAssets` excludes savings/investment; `available.js`
     now takes trailing `avgDailySpend` → `dailySafe` ("~X/day for N days", shown on the hero),
     `projectedLeftover`, and a pace-aware status ("at your usual pace you'll run short").
     `useDashboardData` adds a trailing-90d query + passes `liquidAssets` + `avgDailySpend`.
   - **Forecast v2** (`useAnalytics`) — projection basis is now the **historical average net**
     over complete prior months (falls back to recurring when history is thin), projects the
     **spendable/liquid** balance, and flags the first month it dips below zero →
     `lowBalanceMonth`; ReportsScreen shows a low-balance warning + a "based on your patterns" note.
   - **Insights v2** (`insights.js`) — adds on-pace-to-overspend, month-over-month spend trend,
     and category spikes vs. the user's own trailing average; dedups, surfaces warnings first.
   - _Follow-up: confidence bands + an LLM `generate-insights` edge function for narrative insights._

### Tier 3 — The headline differentiator & polish
7. **AI money coach** — conversational Q&A grounded in the user's data (Gemini +
   a tool/aggregate edge function). Big marketing hook.
8. **Auto-budgets + rollover**, **round-up saving into goals**, **financial-health
   score**.
9. Later: **bank aggregation** (Mono/Stitch for Africa, Plaid for global), **shared
   budgets**, **investment tracking**.

> **✅ AI money coach SHIPPED (v1.9.0 / vc25).** The headline conversational feature.
> - **Edge function (ready, deploy pending web-agent):** `supabase/functions/ai-coach/index.ts`
>   — verifies JWT, server-side Premium check (`subscriptions` active/trialing OR
>   `revenuecat_entitlements.is_active`), builds a coach prompt from `{question, context}`,
>   calls Gemini `gemini-1.5-flash-latest` with `GEMINI_API_KEY` (already in Supabase secrets),
>   returns `{answer}`. Deploy: `supabase functions deploy ai-coach` (verify_jwt ON).
> - **Client:** `lib/coachContext.js` builds a compact, privacy-safe **aggregates-only** snapshot
>   (safe-to-spend, month flows, top categories+budgets, bills, goals, debts — **no raw
>   transactions leave the device**); `screens/CoachScreen.js` is a Premium-gated chat (bubbles,
>   suggested prompts, thinking state, disclaimer) that invokes `ai-coach` and shows a graceful
>   "coach warming up" bubble until the function is live. Entries: More menu, Dashboard `AskCoachCard`.
>   Analytics: `coach_open`, `coach_message`.
> - **Still TODO in Tier 3:** auto-budgets + rollover, round-up saving, financial-health score.

> **✅ PDF/statement auto-import SHIPPED (v1.9.1 / vc26).** The "hand it a bank statement, get
> everything back" capture — the receipt-scan magic, but for a whole statement.
> - **Edge function (ready, deploy pending web-agent):** `supabase/functions/parse-statement/index.ts`
>   — auth via `getClaims`, sends the PDF/image to the **Lovable AI gateway** (`google/gemini-3-flash-preview`,
>   `LOVABLE_API_KEY` — same as parse-receipt/ai-categorize), prompts it to extract EVERY transaction
>   as `{date, description, amount, type, categoryName}` (skips balances/subtotals) AND categorize each,
>   validates + caps at 500 rows, returns `{transactions, count}`. Deploy: `supabase functions deploy parse-statement`.
> - **⚠️ AI-gateway correction:** the deployed functions use the **Lovable gateway + `LOVABLE_API_KEY`**,
>   NOT a direct `GEMINI_API_KEY`. The `ai-coach` function was rewritten to match (it would've failed otherwise).
> - **Client:** `readTransactionFile()` now returns `{kind:'pdf'|'sheet'}` — PDFs/images route to
>   `parseStatement()` (extract → review → import), spreadsheets keep the column-mapper.
>   `autoCategorizeRows()` best-effort AI-categorizes blank CSV rows via `ai-categorize` (bounded: cap 40,
>   concurrency 4, ≥0.6 confidence). `ImportWizard` gained an `extracting` state, a richer upload screen
>   (PDF vs CSV), a password-protected hint, and an "AI-read — double-check amounts" review note. Wired in
>   `AddSheet` with `categories/currency/country`. Analytics: `statement_import_extract`, `statement_import_done`.
> - Reuses the existing preview→confirm→`importCSVTransactions` insert path, so a human always reviews before write.

> **✅ CORE-SYSTEM "cutting-edge" pass SHIPPED (v1.9.2 / vc27).** Every fixable audit finding taken to top grade
> (bank aggregation excluded — a commercial/API decision, not code):
> - **Import reconciliation + dedupe (data integrity → A):** `importCSVTransactions(userId, rows, accountId)`
>   attaches an account (imports now move balances/net worth/safe-to-spend) and skips rows already present
>   (same day+amount+type). ImportWizard preview gained an **account picker**; result says "skipped N already in records".
> - **Learning categorization (→ A−):** `lib/merchantRules.js` (AsyncStorage, per-user, offline) learns
>   merchant→category on every manual add + edit; applied FIRST on capture/import, AI only for the remainder.
> - **Proactive intelligence (→ A−):** `lib/proactive.js` fires app-open local notifications for a predicted
>   month-end **shortfall**, an **unusual charge** (>2.5× category norm), and a **new subscription**; deduped, FX-correct.
> - **Auto-budget + rollover (→ A−):** `autoBudgetFromHistory()` + BudgetScreen "Auto-budget" button + **Rollover**
>   toggle; `useBudget` now converts per account currency and carries prior-month leftover.
> - **Subscription actions (→ A−):** price-hike flag + one-tap **Track as recurring**.
> - **Financial-health score (→ A−):** `lib/healthScore.js` → explainable 0–100 (runway, savings, budgets, debt,
>   trend), shown as a `HealthScoreCard` atop Reports.
> - **FX correctness:** `checkBudgetAlerts` + `useBudget` convert per account (were summing raw).
> - **Remaining category-leader lift (not code-fixable):** live bank aggregation (Plaid/Mono/Belvo).

### Guiding principle
Automate the input (Tier 1), then make the output intelligent (Tier 2), then add
the conversational headline (Tier 3). Order matters: intelligence on a manual feed
helps few people; intelligence on an *automatic* feed is a category-leader.

---

## The strategic call you should make first
Auto-capture is the fork in the road, and it's a **product + compliance** decision,
not just code:
- **SMS parsing (recommended for your market):** highest ROI, Android-native, works
  offline/on-device, moat in East Africa. Needs a Play **SMS-permission declaration**
  (finance apps qualify) and careful privacy handling.
- **Bank aggregation (Mono/Okra/Stitch/Plaid):** broader/cleaner data but per-API
  cost, weaker Africa coverage, and a heavier integration.
- **Stay manual + double down on AI coach:** lower lift, but leaves the retention
  ceiling in place.

My recommendation: build the **region/context foundation (Tier 0)** first so the
product is global-aware by design, then ship the **SMS auto-capture module +
auto-categorization** as the first market-facing win (highest reach-per-effort,
uniquely defensible), then the **AI money coach** as the marketing headline. Add
aggregator adapters (Plaid/Mono/Belvo) per region as you expand into open-banking
markets — the pluggable `TransactionSource` layer means those slot in without
re-architecting.
