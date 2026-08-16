# SafeSpend Mobile — Feature Roadmap & Gap Analysis

## ✅ Build progress (updated)

**Phase 1 — Core parity: DONE.** Period navigation (`PeriodContext` month/year/all + prev/next, wired into Dashboard/Log/Budget/Reports), transfers (`TransferSheet`, transfers in `computeBalances`), recurring transactions (`RecurringScreen`/`RecurringSheet`/`useRecurring` + `lib/recurring.js` auto-processor on app open), settings depth (currency picker, date format, show-cents — `SettingsContext` + Profile).

**Phase 2 — Reporting & intelligence: MOSTLY DONE.** Chart kit (`components/charts.js`, SVG, no native dep), Reports rebuilt as 5 tabs (Overview / Trends / Categories / Needs-Wants / Forecast) via `useReportsData`, Insights on dashboard (`lib/insights.js` + `InsightsCard`), cash-flow forecast (`useForecast`). *Remaining: tap-through drill-down, AI monthly PDF report.*

**Phase 2 — drill-down: DONE.** Tap a category in Reports → `CategoryDrilldownSheet` lists that category's transactions for the period (`HBars` now takes `onPress`).

**Phase 3 — Net worth / data / account mgmt: MOSTLY DONE.** Net worth with assets+liabilities (`useNetWorth`, `NetWorthScreen`, `NetWorthSheets`), data export JSON/CSV + delete-all-data (`lib/dataManagement.js`, Profile → Data), subscription cancel (`useSubscription.cancel` + Paywall), **sessions list/revoke** (`useSessions` + `SessionsSheet`, list-sessions/revoke-session fns), **MFA enrollment** (`MFASetupSheet`, enroll/verify/unenroll) — both in Profile → Security. *Remaining: Google link/unlink, delete-account (needs backend edge fn).*

**Phase 4 — Mobile superpowers: PARTIAL.** Inline AI categorization in Add sheet, **push notifications** (`lib/notifications.js` — local bill reminders 1 day before due, synced on app open + on toggle, honors prefs). *Remaining: home-screen widgets (native), receipt camera (needs Storage + schema col), offline-first, quick-add.*

**Design: PARTIAL.** Icon normalization (`lib/icons.js`), skeleton loaders (`components/Skeleton.js`), color + icon pickers in add/edit sheets (`SwatchPicker`), richer icon set. *Remaining: light theme, React Navigation migration, AI monthly PDF report.*

All changes compile clean via `expo export`. Runs on the standalone debug APK (`android/app/build/outputs/apk/debug/app-debug.apk`) + Metro.

---

A complete comparison of the **web app** (`project/uploads/gosafespend-main`, the mature
source of truth) against the **mobile app** (`SafeSpendMobile`), with a prioritized
plan to reach production parity. Two tracks: **Features** and **Design/UX**.

> TL;DR: The mobile app has solid **core CRUD** for every entity, but is missing most of
> the web app's **depth** — recurring transactions, transfers, multi-period views, the
> reporting suite, net-worth tracking, intelligence/automation, data import/export, and
> the deeper account/settings surface. Design-wise it inherits a strong kit but needs a
> real icon/color system, richer charts, month navigation, skeletons, and polish.

---

## 1. Feature parity matrix

Legend: ✅ done · 🟡 partial/shallow · ❌ missing

| Area | Web app | Mobile | Notes / what's missing on mobile |
|---|---|---|---|
| **Auth — sign in/up/Google/reset** | ✅ | ✅ | — |
| **MFA** | ✅ enroll + verify | 🟡 verify gate only | No TOTP **enrollment** UI (QR/secret) |
| **Sessions (list/revoke devices)** | ✅ | ❌ | `list-sessions`/`revoke-session` fns exist; no UI |
| **Social account link/unlink** | ✅ | ❌ | Google link/unlink in settings |
| **Delete account** | ✅ | ❌ | — |
| **Onboarding** | ✅ multi-step wizard | 🟡 currency + accounts | No categories/income/goals setup, no tour |
| **Product tour** | ✅ | ❌ | First-run guided walkthrough |
| **Dashboard** | ✅ rich | 🟡 | See §2 — missing insights, income breakdown, emergency-fund/balance-after-bills widgets, **period selector** |
| **Period views (month/year/all-time)** | ✅ | ❌ | Mobile is **locked to current month everywhere** |
| **Month navigation (view past months)** | ✅ | ❌ | Cannot browse history by month |
| **Transactions list + search/filter** | ✅ advanced filter | 🟡 basic search + type chips | No date/account/amount filters, no pagination UI |
| **Add/Edit/Delete transaction** | ✅ | ✅ | mobile has account picker + date picker |
| **Transfers between accounts** | ✅ | ❌ | Removed; needs paired ledger entries |
| **Recurring transactions** | ✅ auto-processed | ❌ | daily→yearly, start/end, auto-create on open |
| **Categories (expense + income)** | ✅ + icon picker + reassign-on-delete | 🟡 add/edit/delete | No icon picker, no reassignment flow |
| **Budgets — monthly limits** | ✅ | ✅ | — |
| **Budget rollover (carryover)** | ✅ forward/backward | ❌ | — |
| **Annual budget view** | ✅ | ❌ | — |
| **Budget suggestions** | ✅ (50/30/20 etc.) | ❌ | — |
| **Committed expenses / income allocation** | ✅ | 🟡 | mobile shows allocation %, not committed logic |
| **Accounts (multi, types, balances)** | ✅ + balance chart | ✅ | No balance-history chart |
| **Goals + contributions** | ✅ | ✅ | — |
| **Debt + payoff (avalanche/snowball)** | ✅ + composition chart | ✅ | No composition chart |
| **Net worth (assets + liabilities)** | ✅ categorized, snapshots, trend, NW goal | ❌ | Mobile only sums account balances. No assets/liabilities entities |
| **Bill calendar + due dates + mark paid** | ✅ | ✅ | — |
| **Reports** | ✅ **11 types** + date range + drilldown | 🟡 4 widgets | See §3 — biggest gap |
| **Insights (auto-generated)** | ✅ | ❌ | overspending, savings rate, category dominance… |
| **AI categorization** | ✅ edge fn | ❌ | suggest category from description |
| **Transaction automation** | ✅ | ❌ | link bill→bill-status, debt→debt-payment, goal→contribution |
| **Duplicate detection** | ✅ | ❌ | — |
| **CSV import** | ✅ | ❌ | — |
| **Data export (JSON/CSV)** | ✅ | ❌ | — |
| **Delete all data** | ✅ | ❌ | — |
| **Settings depth** | ✅ many prefs | 🟡 currency + app-lock | No date format, default txn type, start of week, show-cents, theme, budget start month |
| **Notifications (push + email)** | ✅ send-notifications/weekly-summary/reminders | 🟡 prefs persist only | No actual device push; prefs don't drive anything yet |
| **Subscription (Paystack)** | ✅ pricing + manage + cancel + trial | 🟡 checkout + status | No cancel/manage flow, no trial banner; Play-Billing question open |
| **Drill-down navigation** | ✅ everywhere | ❌ | tap a category/stat → filtered transactions |

---

## 2. Dashboard depth gap

Web dashboard widgets the mobile home is missing:
- **PeriodSelector** — month / year / all-time, with prev/next navigation.
- **InsightsCard** — `utils/insights.ts` generates warnings/tips (spending up, great savings, category over budget, near limit, category dominates, "log your income").
- **IncomeBreakdown** — income by source/category.
- **EmergencyFundWidget** — months of expenses covered (mobile has it only inside Reports).
- **BalanceAfterBills** — balance minus upcoming bills.
- **AvailableToSpendWidget** — mobile's version is simplified (`balance + net`). Web's
  `useAvailableBalance` subtracts **unpaid bills for the rest of the month, remaining budget
  targets, and pending goal contributions** — a meaningfully smarter number.
- **Spending-by-category** as a proper labeled pie with legend (mobile has a donut, fine).
- **Trial/Launch banners**, drill-down from each card.

---

## 3. Reports — the single biggest gap

Mobile "Reports" = 4 static widgets (health score, net worth, emergency fund, upcoming bills).
Web "Reports" = a tabbed suite with a **date-range picker**, summary stats, and drill-down:

1. **Financial Health Score** (multi-factor, not just savings rate)
2. **Needs vs Wants** (uses category `is_need`)
3. **Income Analysis** (sources, stability, passive vs active)
4. **Year Comparison** *(premium)*
5. **Progress Report**
6. **Spending Trends** (over time)
7. **Income vs Expense** (bar/line over months)
8. **Category Report** (per-category breakdown + drill-down)
9. **Annual Dashboard** (whole-year rollup)
10. **Cash-Flow Forecast** (projects future balance from recurring + bills)
11. **AI Monthly Report** *(premium — `generate-monthly-report` edge fn returns a PDF)*

All of these need real charts. The mobile app currently has only hand-rolled SVG
(donut/ring/sparkline) — a charting lib (e.g. `react-native-gifted-charts` or
`victory-native`) is the enabling dependency.

---

## 4. Recommended build order (phased)

Ordered by user value × effort. Each phase is shippable.

### Phase 1 — Core parity (highest value, unblock daily use)
1. **Month/period navigation** — a shared `usePeriod` context (month / year / all-time +
   prev/next) consumed by Dashboard, Transactions, Budget, Reports. *Without this the app
   can't show history — the most glaring gap.*
2. **Recurring transactions** — `recurring_transactions` table already exists; add list +
   add/edit sheet + an on-open processor (port `useSupabaseRecurring.processRecurring`).
3. **Transfers between accounts** — `transfers` table exists; add a transfer sheet and
   include transfers in the running-balance calc (`computeBalances`).
4. **Transaction automation** — port `transactionAutomation` so paying a bill / debt /
   goal links correctly (mobile already does bill→expense; extend to debt + goal + matching).
5. **Settings depth** — date format, show-cents, default txn type, start of week, theme,
   budget start month (most already exist as `user_settings` columns).

### Phase 2 — Reporting & intelligence (the "premium" feel)
6. **Charting library** + rebuild Reports as a tabbed, date-range suite (start with Spending
   Trends, Income vs Expense, Category Report, Needs/Wants, Health Score).
7. **Insights** — port `utils/insights.ts` → an InsightsCard on the dashboard.
8. **Cash-flow forecast** (depends on recurring + bills).
9. **AI Monthly Report** (premium) — call `generate-monthly-report`, show/share the PDF.
10. **Drill-down** — tap any category/stat → filtered transaction list.

### Phase 3 — Net worth, data, account management
11. **Net Worth** — assets + liabilities entities (tables exist), categories, snapshots,
    trend chart, net-worth goal. (Premium-gated like web.)
12. **Data export** (JSON/CSV via share sheet) + **CSV import** + **delete all data**.
13. **Auth depth** — MFA enrollment (QR), sessions list/revoke, Google link/unlink,
    delete account.
14. **Subscription management** — cancel/restore, trial banner, plan management
    (plus resolve the **Google Play Billing** requirement — see BACKEND_WIRING.md).

### Phase 4 — Mobile-native superpowers (beat the web app)
15. **Push notifications** — `expo-notifications`; drive bill reminders / budget alerts /
    weekly summary from the prefs that already persist. (Server fns already exist.)
16. **Home-screen widgets** — balance / available-to-spend / upcoming bill.
17. **Receipt capture** — camera → attach photo to a transaction (Transaction detail already
    has a "Receipt" placeholder); optional OCR for amount/merchant.
18. **Offline-first** — cache last data, queue writes (the web app can't do this well).
19. **Quick-add** — share-sheet / shortcut to log an expense in 2 taps.
20. **AI categorization** inline in the Add sheet (premium).

---

## 5. Design / production-readiness (the "feels unfinished" gap)

Observed on-device during the audit:

- **Icon system** — category/goal/account icons were all the generic fallback. `normalizeIcon`
  now maps the common ones, but build a **real icon set** mapped 1:1 to the web's Lucide
  names, and an **IconPicker** so users choose icons (web has one).
- **Color system** — stored category/account colors are in the web's `H S% L%` format and
  several don't parse (render grey). Add a **color picker** and make `parseTriplet` accept
  every stored format, so accounts/categories show their real brand colors.
- **Charts** — replace ad-hoc SVG with a real charting lib for trends/comparisons; the
  reporting suite lives or dies on this.
- **Skeleton loaders** — replace full-screen spinners with content skeletons (premium feel).
- **Empty states** — richer, illustrated empty states with a clear primary action.
- **Month/year context** in headers and day labels (labels currently omit the year, so
  "DEC 6 / JUL 1" are ambiguous across years).
- **Navigation** — the lightweight state-machine works but lacks native gestures, shared-
  element transitions, and deep-linking depth. Consider migrating to **React Navigation**
  before the screen count grows further.
- **Light theme** — web supports light/dark/system; mobile is dark-only. At least respect
  the `theme` setting.
- **Transitions/animation** — add subtle list/sheet animations (`react-native-reanimated`),
  pull-to-refresh already in place.
- **Accessibility** — labels added to the main controls; extend to all list rows and inputs,
  test with TalkBack, check contrast on muted text.
- **Number/format consistency** — confirm currency, negative styling, and large-number
  truncation are consistent across every screen.

---

## 6. Data-model notes (gotchas found while building)

- `expenses.category` / `incomes.source` usually store the **name**, but web bill-automation
  stores a **category id (UUID)** in `category` — mobile now resolves id→name; keep this in
  mind for any new aggregation.
- Account/category **colors** are `H S% L%` triplets (some malformed). **Icons** are Lucide
  kebab-case names. Normalize both at the hook boundary.
- A `user_settings` row existing == onboarded. Many settings columns exist but are unused on
  mobile (date_format, theme, budget_start_month/year).
- Net-worth/assets/liabilities, recurring, transfers, income_categories tables all **exist**
  in Supabase already — these features are mostly **UI work**, not schema work.

---

## 7. Suggested immediate next sprint

If picking one cohesive chunk to do next, do **Phase 1, items 1–3**:
**month navigation + recurring transactions + transfers.** They're the features a daily user
notices first, they share the `usePeriod`/`computeBalances` plumbing, and they unblock
accurate reporting later. Net-worth and the reporting suite (Phases 2–3) are the
"premium product" follow-on.
