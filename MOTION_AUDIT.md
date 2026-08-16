# SafeSpend Motion & Interaction Audit — making it lively without losing function

_Audited: 2026-07-10 · mobile app · versionCode 15 / 1.4.0_

A teardown of micro-animation, haptics, and interaction feel — what already
moves, what sits static, and a prioritized plan to make the app feel alive and
rewarding while staying fast and functional. Guiding rule throughout:
**motion must serve meaning** (feedback, continuity, hierarchy, delight-with-a-reason),
never decoration for its own sake, and always cheap enough to hold 60fps.

---

## Part 0 — What already moves (credit where due)
The app is not motion-dead. Existing, tasteful motion:
- **Sheets** slide up + **pan-to-dismiss** ([useSheetDrag.js](src/components/useSheetDrag.js), FormSheet/AddSheet/ActionSheet).
- **Toast** slide+fade with undo ([ToastContext.js](src/contexts/ToastContext.js)).
- **Confetti** on goal-complete and purchase success ([Confetti.js](src/components/Confetti.js)).
- **Coachmark** spring-in ([Coachmark.js](src/components/Coachmark.js)).
- **Skeleton** shimmer loaders; native-stack **screen slide** transitions.
- **Swipe-to-delete** rows with undo (gesture-handler, LogScreen).
- Press feedback on **FAB** (scale 0.94) and **StatCard** (scale 0.985).
- **Haptics** in ~8 places (tab change, FAB, save, action-sheet select, toast success, goal complete, swipe, filter chips).

So the foundation and the taste are there. The gap is that the **high-value,
high-frequency moments are static**, and there's no shared motion system, so
enlivening things is ad-hoc.

---

## Part 1 — Findings (ranked by delight-per-effort)

### 🔴 1. The hero number doesn't animate — the app's centerpiece just snaps in
Safe-to-Spend is *the* number people open the app for, yet it renders as plain
`<Text>` ([DashboardScreen.js](src/screens/DashboardScreen.js) hero) and snaps to
its value on every load, refresh, and period change. A **count-up roll** (previous →
new value over ~600ms with easing) would make it feel computed-for-you and turn
the number into a moment. Same treatment for the 4 stat cards, Net Worth hero, and
budget/goal totals. Highest emotional payoff, low effort.

### 🔴 2. Progress is static — budgets, goals, and the donut don't fill
`ProgressBar` renders a fixed `width: ${w}%`, `RingProgress` a fixed
`strokeDashoffset`, and `Donut` static wedges ([components/index.js](src/components/index.js)).
Progress *is* motivation — animating the fill/sweep on mount and on change is the
single most satisfying micro-interaction in a finance app (watch your goal ring
sweep to 62%). Budgets and goals are the emotional core; they should move.

### 🟠 3. The Toggle switch snaps instead of springing
`transform: [{ translateX: on ? 18 : 0 }]` ([components/index.js:464](src/components/index.js)) —
instant, no animation. Every native switch on both platforms animates; a
spring-slide knob + track color cross-fade is a cheap, ubiquitous polish that
currently reads as "unfinished."

### 🟠 4. Charts appear fully-formed — no draw-on
`LineChart`, `GroupedBars`, `HBars` ([charts.js](src/components/charts.js)) and
`Sparkline` all render statically. A **left-to-right line draw** (`strokeDasharray`
reveal), **bars growing up**, or a **donut sweep** on first paint and on data change
turns Reports from a static report into something that feels alive and computed.

### 🟠 5. Lists pop in — no entrance, and new items aren't celebrated
LogScreen's FlashList rows, dashboard recent transactions, and account/goal/debt
cards all appear instantly. A **subtle staggered fade+slide-up** on first load, and
especially a **highlight/slide-in for a just-added transaction**, closes the
"did my tap do something?" loop. Right now a new expense just silently appears.

### 🟠 6. Nothing reacts when the numbers change
Log an expense → the dashboard refetches and everything silently re-renders. The
values that *changed* (Safe-to-Spend drops, that category bar grows, budget nears
its limit) could **pulse/flash briefly** to show cause→effect. This is the core
feedback loop of the whole app and it's currently invisible.

### 🟡 7. The primary Button has no press-scale
The main `Button` only dims opacity on press ([components/index.js:338](src/components/index.js)),
while FAB and StatCard scale. The most-tapped control in the app should feel
tactile — a spring scale-to-0.97 with bounce-back.

### 🟡 8. The tab bar indicator jumps
The active pill + icon background switch instantly between tabs
([components/index.js](src/components/index.js) TabBar). A **sliding indicator**
that travels to the tapped tab is a signature "polished app" detail.

### 🟡 9. Celebratory moments are under-used
`Confetti` exists but only fires for goal-complete + purchase. The app is full of
emotional beats that deserve a micro-celebration: **first transaction logged**,
**first budget set**, a **savings milestone** (50% / 100%), **paying off a debt**,
a **daily-logging streak**, coming in **under budget** at month end. These are the
"fun" the request is asking for — reasons to smile that also reinforce good habits.

### 🟡 10. Haptics are good but inconsistent and not semantic
Coverage is decent but ad-hoc: no success haptic when a sheet-save *completes*
(only on tap), no **warning** haptic when a budget is exceeded, no **error** haptic
on failed saves, no celebration haptic on the purchase success screen. Each call
site hand-picks a feedback type. A small semantic helper (`haptics.success()`,
`.warning()`, `.error()`, `.select()`, `.tap()`) makes it consistent and trivial to apply.

### 🔵 11. No reduced-motion support (accessibility + polish gap)
`AccessibilityInfo.isReduceMotionEnabled()` is never checked. Every animation
below must gracefully degrade (cross-fade or snap) for users who enable the OS
reduce-motion setting — both an accessibility requirement and a sign of a mature
motion system.

### 🔵 12. No shared motion system — timings will drift
No duration/easing/spring tokens in the theme; each `Animated` usage hand-rolls
its own numbers. Without a small `motion` token set + reusable primitives, adding
motion stays ad-hoc and inconsistent ("every screen picks a random 300ms").

### 🔵 13. Small state changes are abrupt
Check ↔ uncheck, category select, the read-only lock state, badge appearance —
all instant. Quick scale/cross-fade on these adds cohesion once a system exists.

---

## Part 2 — The one architectural decision: the animation engine
Most of the above is achievable two ways:

- **Option A — add `react-native-reanimated` (recommended).** It's the standard,
  pairs with the already-installed `react-native-gesture-handler`, runs animations
  on the **UI thread** (holds 60/120fps even while JS is busy), and gives
  `entering`/`exiting`/`Layout` animations essentially for free — which is exactly
  what unlocks list entrances (#5), the new-item highlight, and smooth layout
  transitions that are painful on the legacy API. Cost: a native dependency → a
  local rebuild + the `react-native-reanimated/plugin` babel entry (must be last).
  For Expo SDK 51 use reanimated ~3.10.x. This is the path to a genuine 10/10.
- **Option B — stay on the legacy `Animated` API (no new dep).** Covers ~70%:
  count-ups, toggle spring, progress fill, chart draw (Animated.Value + SVG),
  button scale, value pulses. But list-entrance / layout animations are clunky
  and JS-driven layout props (width, strokeDashoffset) risk jank under load.

**Recommendation:** Option A. The app already does local gradle builds and ships
gesture-handler; Reanimated is the natural next step and removes the jank ceiling.
If you'd rather avoid the native dep for now, Option B still delivers findings
1–4, 7, 9, 10 well.

---

## Part 3 — Proposed motion system (do this first, everything else rides on it)
1. **Motion tokens** in `theme/tokens.js`: `motion.duration` (`fast 120`, `base 220`,
   `slow 400`, `celebrate 700`), `motion.easing` (standard / decelerate / spring
   configs). One source of truth; kills timing drift (#12).
2. **Reduced-motion hook** `useReducedMotion()` wrapping `AccessibilityInfo` (#11);
   every primitive consults it and degrades to a cross-fade/snap.
3. **Reusable primitives** so adding motion is a one-liner:
   - `<AnimatedNumber value=… format=…/>` — the count-up (#1).
   - `useAnimatedProgress(value)` → drives ProgressBar/Ring/Donut fills (#2).
   - `<Reveal>` / list `entering` — staggered entrances + new-item highlight (#5).
   - `usePulse(dep)` — flash a value when it changes (#6).
   - `haptics` semantic helper (#10).
4. Apply them across the surfaces in Part 1.

---

## ✅ Implementation status (v1.5.0 / versionCode 16)

Built on the legacy **`Animated` API** (no new native dep — validated by bundle
export, native-driver where possible, reduce-motion aware throughout).

**Foundation** — `motion` tokens in [tokens.js](src/theme/tokens.js) (durations/easings/springs);
[useReducedMotion](src/hooks/useReducedMotion.js); semantic [haptics](src/lib/haptics.js);
primitives in [motion.js](src/components/motion.js) (`AnimatedNumber`, `useAnimatedProgress`, `Reveal`, `usePulse`).

**Tier 1** — count-up `AnimatedNumber` on Safe-to-Spend hero + 4 stat cards + Net Worth
hero; animated fills on `ProgressBar`/`RingProgress`/`Donut` (propagate to budgets/goals);
spring `Toggle` (knob slide + track cross-fade); press-scale on `Button`.

**Tier 2** — chart draw-on (`LineChart` stroke sweep, `GroupedBars` grow-up, `HBars`
per-row fill, `Sparkline` sweep); sliding `TabBar` indicator; staggered list entrance +
new-item slide-in on dashboard recents (keyed by id); pull-to-refresh success haptic.
_(Value-pulse #6 is delivered via the count-up roll + new-item Reveal rather than a
separate flash.)_

**Tier 3** — global [CelebrationContext](src/contexts/CelebrationContext.js) (`celebrate()` = confetti +
success haptic + toast); wired to **first transaction**, **debt paid off**, **goal 50%
milestone** (+ existing goal-complete), and a **celebration haptic on purchase success**.

**Deliberately deferred** (need heavier detection, lower ROI; the `celebrate()` API is
ready for them): **under-budget-month** and **logging-streak** celebrations; animated list
*reorder/removal* (would want Reanimated's `Layout`); Reanimated engine migration.

## Part 4 — Roadmap (tiers)

### Tier 1 — Foundations + the biggest wins (motion tokens, reduced-motion, hero + progress)
Motion system (Part 3) · **AnimatedNumber** on Safe-to-Spend + stat cards + net worth ·
**animated fill** for budgets/goals/donut · **spring Toggle** · **Button press-scale**.
_Low risk, no list-layout work — deliverable even on Option B._

### Tier 2 — Feedback & continuity (the loop feels alive)
**Value pulse** on changed numbers after a save (#6) · **chart draw-on** (#4) ·
**list entrance + new-item highlight** (#5, best with Reanimated) · **sliding tab
indicator** (#8) · pull-to-refresh success tick.

### Tier 3 — Delight & reward (the "fun")
Micro-celebrations for first-transaction / first-budget / savings milestones /
debt payoff / under-budget month / logging streak (#9) · celebration haptic on
purchase success · small state-change transitions (#13).

### Guardrails (every tier)
- Respect reduce-motion. Keep durations short (100–250ms for functional, ≤700ms for
  celebrations). Never block input on an animation. Profile on a low-end Android —
  if a micro-animation can't hold 60fps, cut it. Motion is a seasoning, not the meal.

---

## Appendix — key files
- Primitives to build in: [components/index.js](src/components/index.js) (Toggle, Button, ProgressBar, RingProgress, Donut, TabBar, StatCard), [charts.js](src/components/charts.js), [theme/tokens.js](src/theme/tokens.js)
- Existing motion to learn from: [Confetti.js](src/components/Confetti.js), [Coachmark.js](src/components/Coachmark.js), [ToastContext.js](src/contexts/ToastContext.js), [useSheetDrag.js](src/components/useSheetDrag.js)
- High-value surfaces: [DashboardScreen.js](src/screens/DashboardScreen.js), [BudgetScreen.js](src/screens/BudgetScreen.js), [GoalsScreen.js](src/screens/GoalsScreen.js), [LogScreen.js](src/screens/LogScreen.js), [ReportsScreen.js](src/screens/ReportsScreen.js)
