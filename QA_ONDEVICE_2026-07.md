# SafeSpend — On-Device QA Pass (2026-07-16, Galaxy A04s / Android 14)

Full walkthrough of every tab, sub-screen, and core logic over wireless ADB,
against real user data. Build under test: v2.0.0 (vc35). Fixes shipped in
**v2.0.1 (vc36)**.

## What passed (verified working on-device)

- **Dashboard** — Safe-to-Spend math correct ($68k available − $20k bills − $55k
  goals = −$7k shortfall); stat cards, insights, category donut, budget status,
  recent list all render; no JS errors.
- **AI money coach (premium)** — flagship feature works end-to-end. Two questions
  answered accurately against real numbers ($51,457.50 spend, $46,153 withdrawal,
  electricity $5k vs $4k limit, −$7k Safe-to-Spend, goal progress), with the "not
  a licensed advisor" disclaimer.
- **Log** — sticky day headers + daily totals, All/Income/Expenses filters,
  swipe-to-reveal Edit/Delete, transaction detail → edit sheet.
- **Search** — dedicated screen, searches across ALL time (Jul/Jun/May results),
  summary card (6 matches, $1,800, avg $300/txn) — math correct.
- **Budget** — allocation header, rollover toggle, category list, edit sheet, remove.
- **Reports/Analytics hub** — health score 34/100 with full factor breakdown,
  category tiles with mini-charts, Spending detail (donut + top-category bars).
- **Net worth** — $126,847 assets − $4.50 liabilities = $126,842.50, trend chart.
- **More menu** — profile card (Premium·monthly, avatar photo), regional add-money,
  full sub-screen list with distinct colored icons.
- **Add sheet** — 3 modes (Manual/Scan/Import), NL quick-add, expense/income,
  account picker, category grid (real icons: Dining=utensils, Entertainment=film).
- **Profile & settings** — Account (Verified email), Preferences (appearance,
  currency, region, date, week, budget period, hide amounts), all render.
- **Password reveal (v2.0.0 fix)** — eye toggle confirmed on all 3 Change-password
  fields; password-manager autofill also working (validates the Input hygiene fix).

## Fixed in v2.0.1

1. **Budget edit corrupts the limit (correctness).** The edit sheet pre-filled
   "Monthly limit" with the rollover-inclusive total (e.g. $16,000 = $4,000 base +
   $12,000 rollover). Saving without changing anything wrote the inflated value as
   the new base → runaway inflation. Now passes `cat.baseLimit`.
   `BudgetScreen.js`.
2. **Category icons never showed on transaction rows.** `EXPENSE_ICON` only knew 7
   built-in names, and transactions store category by name, so nearly every row
   fell back to the generic cart. Now resolves each row's real category icon via a
   name→icon lookup from the categories table. `useTransactions.js`, `useDetails.js`.
3. **Transaction detail Time row showed a sparkle** (leftover `icon: 'sparkles'`
   placeholder) and Category was hard-coded to the cart. Now Time = new `clock`
   glyph, Category = the real category icon. `TransactionDetailScreen.js`, `Icon.js`.

## Flagged — not auto-fixed (need a product decision or are user data)

- **Budget "over/under" is inconsistent across screens.** Dashboard budget-status,
  insights, health score, and the coach all treat a category as over-budget against
  its **base** limit (electricity $5k vs $4k → "over"), while the **Budget screen**
  includes rollover (electricity $5k of $16k → "fine, 31%"). Same category reads two
  ways. Decide whether rollover should count toward the "over budget" signal, then
  make all surfaces agree.
- **Rollover sits at the 3× clamp for every category** (Rent $45k = 3×$15k base,
  Food $15k = 3×$5k, etc.). The clamp is doing its job, but every category hitting
  the ceiling suggests the created-at gating may not be limiting accumulation, or
  the budgets simply have many empty months. Worth confirming against the data.
- **Region = United States + USD while clearly in Kenya** (Safaricom, M-Pesa, KPLC,
  KES-magnitude amounts, DD/MM/YYYY date format). User-configurable, not a bug, but
  the onboarding default/detection may be worth revisiting.
- **"Essaypro income" appears in the Spending breakdown** — a user-miscategorized
  expense (analytics correctly pulls from the expenses table), not an app bug.
- **Edit-transaction sheet** has no account picker (can set account on add, not
  edit) and doesn't pre-scroll the current category into view. Minor.
- **Inline sub-screen back behavior.** Hardware Back on an overlay sub-screen (e.g.
  Net worth) doesn't close the overlay first — it resets the tab underneath, so the
  overlay appears stuck and the on-screen chevron then lands on Home rather than the
  list you came from (`RootNavigator.js:178`). Minor UX; navigation fix deferred to
  avoid rushing it.

## Second pass — secondary screens (2026-07-16, cont.)

**Passed:**
- **Paywall** — real localized Kenyan pricing (Annual Ksh 1,083.33/mo billed Ksh
  13,000/yr; Monthly Ksh 1,500/mo = Ksh 18,000/yr), correct SAVE 28% math, premium
  state ("You're a Premium member" + Cancel subscription), accurate feature list.
- **Goals** — $5,000 of $280,000 across 4 goals (targets sum correctly), progress
  rings accurate (AlfWas 17% = $5k/$30k), contribute buttons.
- **Debt tracker** — $140k remaining, "Paid off $45k of $185k = 24%" correct,
  Avalanche/Snowball toggle with correct APR-ordered payoff, per-debt Make Payment/Details.
- **Categories** — Expense/Income tabs, per-category counts, drag-to-reorder.
- **Attention center** ("Needs attention") — 5 actionable items (overdue bills,
  over-budget, due-soon); "tap to pay" correctly deep-links to the Bill calendar.
- **Bill calendar** — due-date dots, **Overdue group** (−$18,000: KPLC $2k + Rent
  $15k + Water $1k, correct), tap-to-mark-paid, Add bill.

**Fixed:**
- **Profile → Version showed "1.9.6"** (real app is 2.0.0). `Constants.expoConfig`
  embeds a stale snapshot in release builds. Now reads `Application.nativeApplicationVersion`
  (the true native versionName). `ProfileScreen.js`.

**Flagged (second pass):**
- **Icon set is under-used.** `normalizeIcon` collapses many distinct web icons
  (heart, gift, book, zap…) to ~35 glyphs, so Electricity, Healthcare, and Gifts
  all show the same sparkle — even though `Icon.js` now has ~90 glyphs. Expanding
  `normalizeIcon`'s VALID set + MAP to use the richer glyphs would make category
  icons distinct. Moderate, deferred (not rushed without device re-verify).
- **Bills has no direct entry in the More menu** — only reachable via the attention
  center. A dedicated "Bills" row would help discoverability.
- **Paywall** pre-selects Annual rather than indicating the user's *current* plan
  (Monthly). Minor.
- **Attention center** lists "KPLC Tokens" as both overdue and due-soon — possible
  duplicate/dedup nuance. Minor.

## Third pass — code audit of remaining screens (2026-07-16, cont.)

Code-audited (user will re-verify via Play upload): **Recurring, Subscriptions,
Annual budget, Goal detail, Debt detail, Account detail** — all clean. CRUD,
empty/error states, requireWrite gating, per-account currency, honest debt-payoff
estimate, variance-tinted annual grid. No bugs found.

**Fixed this pass:**
- **Icon mapping expanded.** `normalizeIcon` now exposes the full ~99-glyph Icon.js
  set (was ~35) with a rich web→mobile MAP, so categories get distinct icons
  (coffee, gift, heart, zap, lightbulb, stethoscope…) instead of the sparkle/cart
  catch-alls. `lib/icons.js`.
- **Removed a duplicate `clock` key** in `Icon.js` (my earlier Time fix added one
  that already existed).

Minor/cosmetic noted (not fixed): Goal-detail Plan card shows the deadline as a raw
ISO string rather than a formatted date; Recurring/Subscriptions rows use a generic
glyph rather than the category icon.

## Not exercised (need live input; previously verified)

- The **Scan-receipt** (camera→OCR) and **Import-wizard** (file→map→preview) AI
  capture flows need real camera/file input that's impractical to drive over ADB;
  verified in earlier sessions. Notifications toggles screen likewise unchanged.

## Not visually tested

- **Login screen email-autocapitalize fix** (v2.0.0) — code-verified and indirectly
  confirmed (the same Input component's password reveal + autofill work on-device),
  but the login screen itself needs a sign-out to view, which would require the user
  to re-authenticate.
