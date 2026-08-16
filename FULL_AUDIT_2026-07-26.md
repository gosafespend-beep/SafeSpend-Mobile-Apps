# SafeSpend Mobile — Full Code Audit (2026-07-26)

Baseline: v2.0.1 / versionCode 36. Prior audit was `AUDIT_REPORT_2026-07.md` (2026-07-15/16,
vc31→vc36). This pass covers everything shipped since, especially per-account currencies,
the RevenueCat billing migration, and the React Navigation/FlashList shell rewrite.

Method: five parallel read-only sweeps (lib+hooks, screens, sheets+components,
contexts+navigation, edge functions+native config), then every finding verified by hand
against the actual code before anything was changed. Findings that didn't survive
verification (a claimed `proactive.js` currency bug, and dead-code hooks nobody imports)
are noted below so they aren't re-flagged next time.

## Fixed this pass

1. **Recurring transactions could post in the wrong currency.** `RecurringSheet.js` let
   you pick any account but always labeled the amount field with the *display* currency
   symbol. `lib/recurring.js processDueRecurring` treats `amount` as native to the
   selected account (per `balances.js`'s documented convention) — so a recurring rule
   against a foreign-currency account silently posted the wrong magnitude on every
   auto-fire. Fixed: symbol now follows the selected account's currency.
2. **Editing a recurring transaction's "Next due" date silently no-op'd.** `RecurringSheet.js`
   built the update patch without `next_due`, so changing the date and saving looked
   successful but the DB row never moved. Fixed: edit path now includes `next_due`.
3. **`TransactionEditSheet` showed the wrong currency symbol for foreign-currency
   accounts** — same bug class as #1, one screen over. A user editing a KES-account
   expense while their display currency is USD saw a "$" prefix; typing a new value
   under that assumption would corrupt the amount. Fixed: symbol now follows
   `txn.currency`.
4. **Annual Budget and Subscription detection ignored per-account currency.**
   `useAnnualBudget.js` and `useSubscriptions.js` summed/compared raw `amount` across
   all accounts with no FX conversion, unlike Dashboard/Accounts/Budget/Net
   Worth/Analytics, which all convert via `useFx().convert`. For any user with more
   than one account currency, the Annual Budget grid and subscription totals/matching
   were wrong. Fixed both to convert through the account's currency into the display
   currency, matching the rest of the app.
5. **AppLock discarded navigation state and unsaved sheet input on every brief
   backgrounding.** `appLocked` was an early `return <LockScreen/>` *before*
   `NavigationContainer` — so it unmounted the whole nav tree (and anything open in it,
   e.g. a typed-but-unsaved Add-transaction sheet) on any `active→inactive` transition,
   including trivial ones like pulling down the notification shade. Fixed: the lock
   screen is now overlaid as a `Modal` on top of the live nav tree (same pattern as the
   paywall), so the stack and any open sheet survive a lock/unlock cycle.
6. **Hardware back button hijacked the tab bar from pushed screens.** `TabsScreen`'s
   `BackHandler` listener had no focus guard, but native-stack keeps `TabsScreen` mounted
   underneath pushed screens (account/goal/debt/txn detail, etc.). Listeners fire LIFO,
   so pressing back while on a pushed detail screen (with a non-Home tab active
   underneath) silently flipped the hidden tab bar to Home instead of popping the visible
   screen — the user had to press back twice. Fixed: gated on `useIsFocused()`.
7. **`useEntitlement()` failed open.** Every sibling context (`useAuth`, `useSettings`,
   `useAppLock`, ...) throws if used outside its provider; `useEntitlement` silently
   granted `canWrite: true` (unlimited premium write access) instead. Currently
   unreachable (every call site is correctly nested), but a future provider-order
   regression would have silently defeated the paywall instead of erroring at dev time.
   Hardened to fail closed like its siblings.
8. **Confetti colors froze at whichever theme was active on cold start.** `COLORS` was a
   module-level `const` evaluated once at import; the app's light/dark switch re-renders
   everything else live via `themeVersion`, but confetti kept using stale colors after a
   theme change. Cosmetic only. Fixed: colors are now computed per-burst.

Verified via `npm test` (36/36 pass, unchanged) and `expo export --platform android`
(clean, 1701 modules) after all fixes.

## Confirmed but deliberately NOT changed

- **Delete/pause actions aren't behind the premium write-gate** (Accounts, Debts, Goals,
  Categories, Bills, Net Worth, Recurring, and swipe-delete on Log all skip
  `requireWrite`, unlike every Add/Edit sheet). This is real and reachable by any
  trial-lapsed user, but it matches a **documented, deliberate product decision** from
  the RevenueCat migration ("deletes + pause-toggles intentionally not gated — users can
  tidy their own data"). Flagging in case that decision is worth revisiting now that it's
  been re-surfaced, not because it regressed.

## False positives caught during verification (for the record)

- `lib/proactive.js` was flagged as sharing the unconverted-currency subscription-detection
  bug — it does not; it already converts every amount via `cvt()`/`convert` before
  grouping/comparing. No change needed.
- `useForecast.js`, `useReports.js`, `useReportsData.js` were flagged for the same
  unconverted-currency issue as `useAnnualBudget`/`useSubscriptions` — but none of the
  three are imported anywhere; they're dead code superseded by `useAnalytics` (per prior
  audit notes) and were left alone rather than fixed or deleted (out of scope for a bug
  pass).
- `android/` being gitignored was flagged as "hand-edited native files aren't under
  version control" — true, but moot right now: this project isn't a git repository at
  all yet, so nothing is under version control. Worth revisiting once/if git is
  initialized (see Recommendations).

## Addendum — subscription cancellation (found live on-device, 2026-07-26)

User hit "Could not cancel — Edge Function returned a non-2xx status code" tapping Cancel
in the paywall. Root cause, confirmed by reading the shared backend:

- **`paystack-manage` (web repo, `gosafespend-main/supabase/functions/paystack-manage/index.ts`)
  cancel action dead-ends when a `subscriptions` row has no `paystack_subscription_code`.**
  Every legitimate write path (`paystack-verify:146-150`, `paystack-webhook:92-96`) sets
  `status:'active'` together with `paystack_subscription_code` — so a row with `active`
  status and no code is orphaned/manually-set data, not a real Paystack billing agreement.
  Previously this returned a 400 and left the user permanently stuck on "Premium" with an
  uncancellable button — nothing upstream to disable, but the code never fell back to just
  clearing local status. **Fixed** (not yet deployed — user's call): now self-heals by
  clearing local status when there's no external subscription to disable.
- **Mobile client was masking the real error.** `EntitlementContext.js cancel()` read
  `error?.message` on a failed `functions.invoke`, but supabase-js wraps any non-2xx
  edge-function response in a generic `FunctionsHttpError` ("Edge Function returned a
  non-2xx status code") — the actual `{error: "..."}` body has to be read from
  `error.context` separately. **Fixed**: now unwraps the real reason.
- Both are Android-billing-relevant even though the file lives in the web repo, since
  `paystack-manage` is shared backend and legacy/orphaned rows can affect either client.
- **Not done at user's request:** did not deploy the edge function fix, and did not touch
  the specific stuck `subscriptions` row in the live Supabase project — both left for the
  user to action deliberately.

## Recommendations (not implemented — pick and prioritize)

- **R1 — `ai-coach`/`parse-statement` have no size cap on `context`/uploaded file.**
  `question`/`history` are bounded server-side but `context` (ai-coach) and the uploaded
  file (parse-statement, the single most expensive call in the app) aren't — a valid
  JWT holder could force outsized `LOVABLE_API_KEY` spend. No rate limiting exists on
  either function either.
- **R2 — `revenuecat-webhook`'s out-of-order check is a TOCTOU race**, not atomic
  (read `event_timestamp_ms`, compare in app code, then `upsert` with no conditional
  `WHERE`). Two near-simultaneous events for the same user could commit out of order,
  leaving entitlement state reflecting the stale one. Needs a DB-level conditional
  upsert (RPC with `WHERE event_timestamp_ms < EXCLUDED.event_timestamp_ms`), not a
  client-side fix.
- **R3 — `parse-statement` forwards raw upstream AI-gateway error text to the client**
  on failure (capped at 400 chars, no secrets, but reveals vendor/gateway internals).
  Trim to a generic message.
- **R4 — Deep links (`add`/`scan`/`message`) are silently dropped if they arrive while
  the app is at the auth gate / onboarding / MFA / lock screen** — the `Linking`
  listener only exists inside `TabsScreen`, which isn't mounted yet in those states.
  Edge case (cold start still works via `getInitialURL`); only a live foreground link
  during those states is lost.
- **R5 — Plaintext release-signing password committed to `android/gradle.properties`**
  (`RELEASE_STORE_PASSWORD`/`RELEASE_KEY_PASSWORD`, same value for both), protected only
  by the blanket `android/` gitignore rule. Low urgency with no repo yet, but worth
  moving to a non-tracked local file or CI secret before this project is ever put under
  version control.
- **R6 — No git repository exists for this project at all**, so none of the manually
  re-applied native customizations (signing config, share-intent filter, app shortcuts,
  home-screen widget files — all documented as "wiped by `expo prebuild`, must
  re-apply") have any durable history or recovery path outside this machine. Worth
  deciding deliberately: commit `android/` as-is (bare workflow) or move the
  customizations into an Expo config plugin that regenerates them on prebuild.
