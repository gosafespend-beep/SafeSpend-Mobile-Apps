# SafeSpend Mobile — UI/UX Audit & Roadmap to 10/10

Audited from source: all 29 screens, 20 sheets, the component kit, navigation shell, and
design tokens. Severity scale: 🔴 **Blocker/bug** · 🟠 **High** (felt by every user daily) ·
🟡 **Medium** (polish that separates good from great) · 🔵 **Low** (nice-to-have).

**Verdict: 7/10 today.** The design system is genuinely strong — coherent tokens, disciplined
typography (Inter + JetBrains Mono tabular numerals for money), consistent cards/badges/spacing,
good skeletons, semantic money colors. What holds it back is *architecture-level UX mechanics*
(navigation, lists, gestures, feedback) and a handful of real bugs. None of it is lipstick;
it's mostly plumbing.

---

## Part 1 — Cross-cutting findings (the 20% that fixes 80%)

### 🔴 1. Android Alert menus silently drop options
`Alert.alert` is used as a long-press context menu on Goals, Debts, and Bills with **4 buttons**
(e.g. *Add contribution / Edit / Delete / Cancel*). **Android renders at most 3 Alert buttons** —
the 4th is dropped, so on Android some users literally cannot reach Edit (or Delete) from
long-press. This is a functional bug, not a style choice.
**Fix:** replace every `Alert.alert`-as-menu with a proper bottom action sheet (matches the
app's own sheet design language). Files: [GoalsScreen.js](src/screens/GoalsScreen.js),
[DebtScreen.js](src/screens/DebtScreen.js), [BillCalendarScreen.js](src/screens/BillCalendarScreen.js),
[AccountsScreen.js](src/screens/AccountsScreen.js), theme/date/week pickers in
[ProfileScreen.js](src/screens/ProfileScreen.js).

### 🔴 2. Theme-stale colors after switching Light/Dark
`StyleSheet.create` styles that embed `c()` values are evaluated **once at module load**
(dark theme): `styles.kicker` in [components/index.js](src/components/index.js) and the
module-level `styles_kicker` in [BudgetScreen.js:108](src/screens/BudgetScreen.js). After the
user switches themes, those texts keep the old theme's color until app restart.
**Fix:** move color values out of static StyleSheets into render-time styles (the codebase
already does this correctly everywhere else).

### 🟠 3. One global ScrollView wraps every screen
[RootNavigator.js:213](src/navigation/RootNavigator.js) renders all content inside a single
`ScrollView`. Consequences:
- **No list virtualization.** The Log renders *every* transaction as mounted views. At 1–2k
  transactions the tab will visibly jank and memory balloons. This is the single biggest
  scalability risk in the app.
- **Scroll position resets** on every tab switch and on every `refreshKey` remount.
- No sticky day headers in Log, no collapsing headers, no scroll-linked polish anywhere.
**Fix:** move scrolling into each screen. Log/Search/Accounts/etc. become `FlashList`
(or `FlatList`) with sticky section headers; Dashboard keeps a ScrollView. The shell renders
only Header/TabBar/FAB.

### 🟠 4. No screen transitions or back gesture
Tab/sub/detail changes are instant conditional re-renders. There is no animation, and on iOS
there is **no swipe-back** (Android hardware back is handled; iOS users must find the header
arrow). The app *feels* like a webview at exactly the moments it should feel native.
**Fix (recommended):** adopt `@react-navigation/native-stack` + bottom-tabs. You keep the custom
TabBar/Header as custom components but gain native push/pop animation, swipe-back, screen
lifecycle, and deep links effectively for free. Alternative: Reanimated slide/fade transitions
in the current shell — cheaper, but you'll rebuild navigation eventually anyway.

### 🟠 5. Full-app remount as a refresh strategy
Saving anything bumps `refreshKey`, which remounts the entire content tree (skeleton flash,
scroll reset). Pull-to-refresh is a `setTimeout(900)` — it *pretends* to wait.
**Fix:** the `RefreshContext.bump()` refetch-in-place mechanism already exists — use it for
saves too, and make pull-to-refresh await the actual refetch promises. Delete `refreshKey`.

### 🟠 6. Hidden interactions with zero affordance
Edit/Delete/Contribute/Mark-paid live behind **long-press** with no visual hint anywhere.
FAB long-press = "repeat last transaction" — a great feature nobody will ever discover.
**Fix:** (a) add a kebab (⋯) button on cards that opens the same action sheet; keep long-press
as the power-user shortcut; (b) surface "repeat last" as a small chip inside the AddSheet
("↺ Repeat: Coffee $4.50") and in the product tour.

### 🟠 7. No toast/snackbar system — feedback is Alert or nothing
Success paths are silent (save closes the sheet) or interruptive (`Alert` for "Added again",
import success, etc.). Deletes are confirm-dialog-only with **no undo**.
**Fix:** add one global toast component (2s, bottom, above TabBar). Use it for: transaction
saved, bill marked paid, deleted (with **Undo** button — soft-delete then commit), import
results, copied, errors that don't block. Reserve Alert strictly for destructive confirms.

### 🟠 8. The header avatar is a lie
[components/index.js:33](src/components/index.js) — the top-right avatar circle is decorative
(`View`, not `Pressable`). It looks exactly like a profile button on every screen and does
nothing when tapped.
**Fix:** make it open Profile (and show the real avatar image once loaded). Consider a bell
icon + unread dot alongside once in-app notifications exist.

### 🟡 9. Accessibility is half-done
The kit's Button/TabBar/FAB have proper roles/labels — good. But: filter chips, category grid
tiles, account chips, list rows, and period-mode pills are plain `Pressable`s with no
`accessibilityRole`/`state`; kicker text at 9–10px with `fgMuted` (50% lightness) is below
WCAG contrast at that size; several touch targets are sub-44px (30px period arrows, 30px chips).
There is no `maxFontSizeMultiplier` strategy, so large system fonts will break card layouts.
**Fix:** sweep for roles/labels; raise `fgMuted` a step for ≤11px text or bump those to 11–12px;
give chips `hitSlop`; test at 1.3× font scale and pick sane `maxFontSizeMultiplier` per style.

### 🟡 10. Empty states are an afterthought
Most are icon + one grey line ([AccountsScreen.js:68](src/screens/AccountsScreen.js): "No
accounts yet." with no button). First-run Dashboard shows four $0 stat cards — cold.
**Fix:** one `EmptyState` component: illustration-grade icon, title, one-line explanation,
**primary CTA** ("Add your first account"). Dashboard first-run should become a checklist
("Add an account → Log a transaction → Set a budget") that checks itself off — this doubles
as activation funnel.

### 🟡 11. Inconsistent loading patterns
Dashboard/Budget/Reports/Accounts/Goals use `ScreenSkeleton` (nice); Log, Search, Debt,
Notifications use a bare centered `ActivityIndicator`.
**Fix:** skeletons everywhere a layout is known; keep spinners only inside buttons.

### 🟡 12. Haptics are inconsistent
Tab bar, FAB, tour, and AddSheet-save have haptics; toggles, chips, mark-paid, delete,
goal-contribution save, and pull-refresh completion don't.
**Fix:** haptic policy — selection() for choosing, impact(Light) for commits, notification
(success/warning) for outcome toasts. Centralize in the kit (Toggle, chips, Button variant).

### 🟡 13. Date/locale settings exist but are ignored
`settings.dateFormat` and `startOfWeek` are user-configurable, yet `shortDate()` and detail
screens hardcode `en-US` formats, and the Bill calendar hardcodes Sunday-first weekday headers.
**Fix:** one `formatDate(iso, settings)` helper used everywhere; calendar respects
`startOfWeek`.

### 🟡 14. No offline story
Every screen fetches live; airplane mode = error states with nothing to show, and a cold start
shows skeletons even for data seen 10 seconds ago.
**Fix (big win):** cache last-known query results in AsyncStorage keyed per user
(stale-while-revalidate). App opens instantly with real numbers, then refreshes. An offline
banner + queued writes is the 10/10 version; the read-cache alone gets you 80%.

### 🔵 15. Misc kit polish
- `ErrorState` retry icon is `trendingUp` — should be a refresh/rotate icon.
- Sheet drag-handles (AddSheet, FormSheet) are decorative — the bar implies swipe-to-dismiss;
  implement it (Reanimated pan) or users will flick and feel the app ignore them.
- `ProductTour` titles render in **JetBrains Mono** (`num(700)`) — monospace headlines read as
  a glitch next to Inter everywhere else; also add horizontal swipe between slides.
- Sign out ([MoreScreen.js:104](src/screens/MoreScreen.js)) has no confirmation — one mistap
  from the More tab logs the user out.
- `StatesScreen` (dev gallery) ships in the prod bundle — strip it behind `__DEV__`.

---

## Part 2 — Screen-by-screen

### Auth (AuthScreen)
Clean; Google button with proper 4-color mark; verified-email handling exists.
- 🟡 No show/hide-password eye toggle (Input supports `secure` but no reveal).
- 🟡 No password strength hint on sign-up; errors arrive as Alerts instead of inline `Input error`.
- 🟡 No "keep me signed in" copy or biometric-unlock upsell after first login.
- 🔵 If you ever ship iOS: Apple Sign-In is mandatory alongside Google.

### Onboarding (OnboardingScreen)
Good bones: progress bar, currency search, account presets with starting balances, skip.
- 🟠 Ends cold. Add two steps that massively help retention: **notification permission priming**
  (explain bill reminders *before* the OS prompt) and **app-lock/biometric offer**.
- 🟡 "Skip setup" exists only on step 0; allow skipping from any step.
- 🟡 No theme choice moment (defaults dark); a 2-tap Light/Dark/System step costs nothing.
- 🔵 Offer "Start with sample data" toggle for people who want to explore first (label it
  clearly and make it one-tap removable — you already have `deleteAllData`).

### Product tour (ProductTour)
- 🟡 Mono headlines (above), no swipe, no imagery. Consider replacing static slides with a
  3-step *coach-mark overlay* pointing at the real FAB / Safe-to-Spend card / Budget tab —
  contextual beats abstract.

### Dashboard (DashboardScreen)
Strong information design; insights card is a differentiator.
- 🟠 **Safe to Spend is the product's namesake and it sits third**, below the stat grid and
  insights. Make it the first, biggest element — it is the one number users open the app for.
- 🟡 Stat cards aren't tappable (Balance → Accounts, Expenses → Reports/spending). Every number
  should be a door.
- 🟡 `hideBalances` setting: verify every surface masks (stat cards, hero, recent rows).
- 🔵 Greeting/period context ("Good morning, Samuel — March") would warm it up; currently the
  header just says "Safe Spend" forever.

### Log (LogScreen)
- 🟠 Virtualization (see Part 1 #3) — this screen is where it bites.
- 🟠 **No swipe actions.** Swipe-left to delete, swipe-right to edit/duplicate is table-stakes
  in 2026 finance apps and removes the hidden-long-press problem entirely here.
- 🟡 The "search" input is a fake input that opens another screen — fine pattern, but it renders
  a focusable-looking field; make it visibly a button (magnifier + "Search" label) to avoid the
  dead-keyboard moment.
- 🟡 Day headers should stick while scrolling (comes free with sections + FlashList).
- 🔵 Row tinting (income rows green-tinted full-width) is loud at scale; consider tinting only
  the amount + icon and let the surface stay neutral.

### Budget (BudgetScreen)
The income→budgeted→to-allocate equation card is excellent zero-based-budgeting UX.
- 🟡 Category rows open the edit sheet directly; there's no per-category spending drilldown from
  here (Reports has one — link them: tap = drilldown, kebab = edit).
- 🟡 When over-allocated, the card shows it, but there's no one-tap "distribute remaining /
  trim evenly" helper — the delightful version suggests the fix.
- 🔵 No month-to-month copy ("Start this month from last month's budgets") — huge time-saver.

### Reports (ReportsScreen)
Ambitious and well-executed hub (8 categories, 25+ graphs, live tile previews).
- 🟠 The hub/detail navigation happens *inside* the tab while the app Header still says
  "Reports" with no back arrow — back is a text link inside content and Android back is
  intercepted. Wire it into the real navigation stack so the header/back behave like every
  other detail screen.
- 🟡 Charts have no axis labels/gridlines/touch tooltips (LineChart especially) — numbers
  without scale. Even min/max labels + last-point value would fix 80%.
- 🟡 Range selection resets to "6 mo" every visit; persist it.
- 🔵 An "export this chart as image/share" affordance turns Reports into a growth loop.

### Add flow (AddSheet) — the most important surface in the app
Feature-rich (NL quick-add, receipt scan, splits, recurring, AI category) and mostly great.
- 🟠 After save it always jumps to the Home tab even if you were on Log — disorienting; stay
  where the user was and toast the success.
- 🟠 The category grid shows *all* categories at equal weight; with 15+ it dominates the sheet.
  Show top-6 (already sorted by use — good) + "More…" expander.
- 🟡 Amount field: no expression support (`12+7.5`) — power users love it, trivial to add.
- 🟡 Split rows use a horizontal chip scroller per row — fiddly at 3+ splits; a compact
  category-picker popover per row would breathe.
- 🟡 "Save & add another" button for batch entry sessions (grocery day).
- 🔵 Transfer is missing here (it lives in Accounts) — a third toggle (Expense/Income/Transfer)
  would centralize money movement.

### Accounts / Goals / Debts (list + detail screens)
Consistent hero-card + list pattern, ring progress on goals is lovely.
- 🔴 Long-press menus (Part 1 #1).
- 🟡 Goals: the "+" contribution button is good; when a goal completes there's a 🎉 text — add a
  real moment (confetti burst / haptic success). Emotional peaks are what people screenshot.
- 🟡 Debts: avalanche/snowball `method` state exists but I see no visible toggle UI on screen to
  switch strategy — expose it as a segmented control with a one-line explainer.
- 🔵 Accounts: archived/hidden account support is absent (delete is the only exit).

### Bill calendar (BillCalendarScreen)
- 🟠 Calendar day cells are not tappable — tapping a dotted day should show that day's bills
  (and empty days could offer "add bill on the 14th"). Right now the calendar is read-only
  decoration above the list.
- 🟡 Respect `startOfWeek` (Part 1 #13).
- 🟡 "Mark paid" confirm explains it posts an expense — good — but posts to "primary account"
  with no choice; let the confirm sheet pick the account.
- 🔵 Overdue bills (day < today, unpaid) appear in neither "Upcoming" (filtered `day >= today`)
  nor "Paid" — **they vanish from both lists**. Add an "Overdue" group in red. (Borderline 🟠.)

### Search (SearchScreen)
Instant local results + sum/avg summary card = genuinely nice.
- 🟠 It searches only the transactions of the **currently selected period** (it reuses
  `useTransactions`, which is period-scoped) — searching "rent" in March mode won't find
  January's rent. Search should always query all time, with optional filters.
- 🟡 No recent-searches, no amount/date filters ("coffee >5", category chips) — cheap wins here.

### Transaction detail (TransactionDetailScreen)
- 🟡 Receipt image: transactions can carry `receipt_url`, but the detail screen never shows the
  receipt. Show a thumbnail → full-screen viewer.
- 🔵 "Duplicate" action next to Edit/Delete (the repeat-last plumbing already exists).

### More (MoreScreen) & Profile (ProfileScreen)
More hub with live metas (net worth, upcoming bills count) is excellent. Profile is the most
complete settings screen I've seen in an app at this stage (sessions, MFA, exports, imports).
- 🟠 Sign-out confirm (Part 1 #15) and Alert-pickers → sheets (Part 1 #1).
- 🟡 Version row should copy diagnostics on tap (version + user id) for support emails.
- 🔵 "Help & support" opens mailto only; a tiny FAQ page will deflect most emails.

### Notifications (NotificationsScreen)
- 🟡 Only 4 binary toggles. Bill reminders need a "days before" choice (0/1/3) and budget alerts
  a threshold (80%/100%) — the backend columns can come later; even fixed choices beat none.

### Paywall (PaywallScreen)
Now correct (Play billing, localized prices, trial CTA, restore).
- 🟡 The feature table lists 10 rows at equal weight; bold the 3 that sell (receipts AI,
  forecasting, unlimited) and collapse the rest.
- 🔵 Add a "what happens after trial" timeline (Day 1 / Day 5 reminder / Day 7 charge) — proven
  to raise trial starts.

### Lock / MFA / Password screens
Solid. 🔵 LockScreen could auto-retry biometrics on app foreground and show a subtle logo-pulse
while prompting.

---

## Part 3 — The roadmap to 10/10

### Tier 1 — Bugs & trust (do before wide testing) ~1 week — ✅ DONE (v1.1.0)
1. Action sheets replace all Alert menus (fixes the Android 4-button bug). 🔴
2. Theme-stale StyleSheet colors. 🔴
3. Search across all time, not current period. 🟠
4. Overdue bills group. 🟠/🔵
5. Sign-out confirm; header avatar → Profile. 🟠
6. Save no longer yanks user to Home; real pull-to-refresh; kill `refreshKey` remounts. 🟠

### Tier 2 — Feels-native mechanics ~2–3 weeks — ✅ DONE (v1.1.0; cache covers Dashboard/Log/Accounts)
7. React Navigation (native stack + tabs): transitions, iOS swipe-back, per-screen scroll. 🟠
8. FlashList virtualization + sticky headers (Log, Search, lists). 🟠
9. Swipe actions on transaction rows (delete w/ undo, edit). 🟠
10. Global toast + undo system; haptic policy. 🟠
11. Draggable sheet dismissal (the handle must work). 🟡
12. Offline read-cache (stale-while-revalidate). 🟡

### Tier 3 — Delight & conversion ~2 weeks — ✅ DONE (v1.1.0 / versionCode 7; amount-math skipped — decimal-pad keyboard can't type operators)
13. Dashboard: Safe-to-Spend first + tappable stat cards + first-run activation checklist. 🟠
14. Empty-state system with CTAs everywhere. 🟡
15. AddSheet: top-6 categories + More, save-&-add-another, amount math, stay-in-place. 🟡
16. Onboarding: notification priming + biometric offer steps; coach-mark tour v2. 🟡
17. Goal-complete celebration; chart axis labels + tooltips; persist Reports range. 🟡
18. Accessibility sweep (roles, contrast, hitSlop, font-scale). 🟡

### Tier 4 — 10/10 differentiators — ⚠️ PARTIAL (v1.2.0 / versionCode 8)
Done: **app shortcuts** (long-press icon → Add expense / Scan receipt, via `safespend://`
deep links), **offline write queue** (queues inserts on network failure, auto-syncs on
foreground — pairs with the read-cache), **in-app attention center** (header bell + unread dot +
"Needs attention" screen aggregating overdue/due-soon bills, over-budget categories, goal
deadlines, unverified email), **bill-payment account picker**.
Completed in v9:
19b. ✅ Android **home-screen widget** — built as a *pure native* AppWidget (no library, no
    prebuild): `SafeSpendWidget.kt` reads the snapshot JS writes to AsyncStorage
    (`widget:safeToSpend` in the RKStorage SQLite DB), status-colored amount, 30-min refresh,
    tap opens the app. Respects hide-balances. **Needs on-device verification** (add widget,
    check number appears after opening the app once).
20b. ✅ Shareable report cards — every Reports graph card has a share button
    (react-native-view-shot capture → system share sheet, subtle branding line).
    ✅ Per-account currencies (v1.3.0 / versionCode 10) — Phase 0 (schema + `fx_rates` +
    daily `fx-refresh` cron) shipped by the web agent; mobile Phase 2 done: `FxProvider`
    (rates cached SWR from `fx_rates`) + `convert()`; account currency picker; native
    rendering on account cards/detail/transaction rows/transfers; cross-currency transfers
    (`to_amount`); balance math converts aggregates → total balance shows `≈` + "Converted to
    X" when multi-currency; onboarding + add sheets denominate in the right currency.
    ✅ Multi-currency aggregate conversion (v1.3.0 / versionCode 12) — flow totals now convert
    each transaction from its account's currency into the display currency before summing, so
    they're correct once a user holds accounts in more than one currency:
    - **Dashboard** — `useDashboardData` builds `cvt(amount, account_id)` and applies it to
      `totalIncome`/`totalExpenses`/`net` and per-category spending; `DashboardScreen` prefixes
      the Safe-to-Spend hero, all 4 stat cards, and the status line with `≈` when `multiCurrency`.
    - **Reports** — `useAnalytics` pre-converts every expense/income to `_amt` and drives all
      monthly/by-category/by-source aggregates from it; `ReportsScreen` shows a "converted to X
      at today's rates" banner (hub + detail views) when multi-currency.
    - **Net worth** — `useNetWorth` converts account balances via `computeBalances` opts; the
      hero shows `≈` + a converted-rate note when multi-currency.
    All conversions are no-ops (identity) for single-currency users, so nothing changes for them.
    *Still deferred (backend-defaulted, safe follow-ups):* Forecast aggregate card; goal/debt/bill
    currency pickers — new records default to the display currency.

### Effort/impact cheat-sheet
| Item | Impact | Effort |
|---|---|---|
| Action-sheet menus (Android bug) | Very high | Low |
| Navigation library + transitions | Very high | Medium |
| FlashList + swipe actions | Very high | Medium |
| Toast + undo | High | Low |
| Safe-to-Spend first + tappable stats | High | Low |
| Offline read-cache | High | Medium |
| Widget + shortcuts | High (retention) | Medium |
| Theme-stale fix, sign-out confirm, avatar | Medium | Trivial |
