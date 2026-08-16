# App Review Notes — Safe Spend 2.1.8 (6)

Response to Guideline 2.1 (Information Needed), submission `74aa59dc-6847-42fa-8d26-90c9d63e56b2`.

**How to use this file**
- Part 1 is paste-ready text for **App Store Connect → App Review Information → Notes**. Fill the `[[BRACKETED]]` blanks first.
- Part 2 is the shot list for the screen recording.
- Part 3 is the pre-flight checklist to run before you resubmit.

---

## Part 1 — Paste into the Notes field

> Paste everything between the rules below. It answers Apple's items 2–8 in their order.

---

**DEMO ACCOUNT**

Email: `[[DEMO_EMAIL]]`
Password: `[[DEMO_PASSWORD]]`

This account is pre-loaded with sample accounts, transactions, budgets, bills and goals so every screen has real data. It is a Premium account, so all features are unlocked without a purchase. To review the purchase flow instead, please create a new account — see item 8 below.

There is only one account type. Sign-in options are email/password, Sign in with Apple, and Google. The demo account above uses email/password.

---

**2. DEVICES AND OPERATING SYSTEMS TESTED**

- `[[DEVICE 1, e.g. iPhone 14 Pro — iOS 26.x]]`
- `[[DEVICE 2, if any]]`
- `[[SIMULATOR/OTHER, if applicable — label it accurately]]`

Android builds of the same codebase are tested on `[[ANDROID DEVICES]]`.

---

**3. WHAT THE APP DOES AND WHO IT IS FOR**

Safe Spend is a personal budgeting and money-tracking app.

**The problem it solves.** Most people cannot answer a simple question: "how much can I actually spend today without breaking something later?" Bank balances lie, because they don't know about rent due Friday, the annual insurance bill, or the savings goal you're funding.

**What the app does.** Safe Spend calculates a single "Safe-to-Spend" number from the user's income, upcoming bills, budgets, goals and debt payments, and keeps it honest as they log spending. Around that core number the app provides: budgets with rollover, savings goals, debt payoff tracking, a bill calendar, recurring transactions, subscription tracking, net worth, cash-flow forecasting, a financial health score, and reports.

**How data gets in.** The user enters transactions manually, scans a paper receipt with the camera, pastes a bank or mobile-money SMS/notification text, or imports a statement file (CSV/XLSX/PDF). AI reads receipts, statements and pasted messages and fills in amount, merchant, date and category.

**Target audience.** Individuals and households managing personal money — with a particular focus on markets where mobile money and bank SMS alerts, rather than card feeds, are how people actually transact.

**Important:** Safe Spend does **not** connect to bank accounts, and does not move, hold, transfer or invest money. It is a record-keeping and planning tool over data the user supplies. See item 7.

---

**4. SETTING UP AND REACHING THE MAIN FEATURES**

1. Launch the app. The Welcome screen asks what the user wants to achieve (stop overspending / save / clear debt / track spending).
2. Create an account or sign in. Email/password, Sign in with Apple, or Google.
3. A short onboarding follows: Currency → Account balance → Income and payday → the Safe-to-Spend reveal → notification opt-in. Every step can be skipped.
4. The app opens on the **Home** tab, showing the Safe-to-Spend number, upcoming bills and recent activity.

Bottom tab bar: **Home · Log · Budget · Reports · More**.

- **Home** — Safe-to-Spend, attention items, upcoming bills, quick actions.
- **Log** — full transaction list, search, filters.
- **Budget** — category budgets, rollover, auto-budget.
- **Reports** — spending breakdowns, trends, health score, cash-flow forecast.
- **More** — Accounts, Goals, Debts, Bill Calendar, Recurring, Subscriptions, Net Worth, Annual Budget, Categories, AI Coach, Profile and Settings.
- **Center "+" button** — add a transaction: manually, by scanning a receipt (camera), or by pasting a transaction message.

**Permission prompts and when they appear**

| Prompt | Trigger | Why |
|---|---|---|
| Notifications | Last onboarding step, or More → Notifications | Bill due reminders, budget warnings |
| Camera | "+" → Scan receipt | Photograph a paper receipt for AI to read |
| Photo Library | "+" → choose an existing receipt image; Profile → change avatar | Import a receipt image or set a profile picture |
| Face ID | Profile → Security → App Lock (opt-in, off by default) | Unlock the app |

The app does **not** use location, contacts, microphone, or App Tracking Transparency. No IDFA is requested and no cross-app tracking occurs.

**Account deletion.** Profile → Delete account. This permanently deletes the auth user and all associated data server-side. It is reachable in two taps from the main app, without contacting support.

---

**5. EXTERNAL SERVICES AND TOOLS**

| Service | Role |
|---|---|
| Supabase | Authentication, Postgres database, serverless edge functions |
| Sign in with Apple | Authentication provider |
| Google Sign-In | Authentication provider |
| RevenueCat | Subscription and entitlement management on top of StoreKit |
| Apple StoreKit / App Store | **The only payment processor on iOS.** All iOS purchases are Apple in-app purchases |
| Lovable AI Gateway (Google Gemini) | AI receipt reading, statement parsing, transaction categorization, and the AI money coach |
| Sentry | Crash and error reporting |

**On payments:** the iOS build bills exclusively through Apple in-app purchase. The codebase contains a Paystack integration used only by the separate web product at gosafespend.com; it is unreachable from the iOS app, and no alternative payment method, external purchase link, or price is shown to iOS users.

**On AI and user data:** AI requests are proxied through our Supabase edge functions to the AI gateway. Receipt images, statement contents and the financial context needed to answer a coach question are sent for processing. No credentials or payment details are ever sent. This is disclosed in our privacy policy at https://gosafespend.com/privacy-policy.

---

**6. REGIONAL DIFFERENCES**

The app functions consistently in all regions — every feature is available everywhere. Two things adapt to the user's country, and both are cosmetic rather than functional gating:

1. **Currency.** The default currency is suggested from the device region and can be changed at any time in onboarding or Settings. Multi-currency accounts are supported everywhere.
2. **Transaction-capture ordering.** The "add transaction" screen leads with whichever input method is most relevant locally — pasting a mobile-money/bank SMS in markets where that is how people transact, receipt scanning elsewhere. All capture methods remain available to every user in every region regardless of ordering.

Subscription prices are Apple's standard regional equivalents; the app reads and displays whatever localized price StoreKit returns and never hardcodes one.

No content, feature or legal term differs by region.

---

**7. REGULATED INDUSTRY / THIRD-PARTY MATERIAL**

Safe Spend does not operate in a regulated capacity and requires no licence:

- It does **not** connect to bank accounts or use any bank-aggregation provider.
- It does **not** hold, transfer, send, receive, exchange or invest funds.
- It does **not** extend credit, offer financial products, or give personalized investment advice.
- It is **not** affiliated with any bank or financial institution, and does not display any bank's marks or protected content.

All financial data in the app is entered by the user (typed, photographed, pasted or imported from a file they hold) and stored in their own account. The app is a calculator and ledger over that data.

The AI coach provides general budgeting guidance grounded in the user's own numbers. It does not provide regulated financial, investment, tax or legal advice.

---

**8. IN-APP PURCHASES AND HOW TO REACH THEM**

**What is sold.** One Premium subscription, offered as two auto-renewable options in the "SafeSpend Premium" group:

- **Safe Spend Premium Annual** — includes a 7-day free trial
- **Safe Spend Premium Monthly** — no trial

Both grant the identical `premium` entitlement. The free trial is configured on the annual plan only, and is offered only to users who have not previously used it.

**Free vs. Premium.** Without a subscription the app is **read-only**: the user can view all their existing data, browse every screen, run reports and export their data at no cost. Premium unlocks *writing* — adding and editing transactions, receipt scanning, statement import, AI categorization, the AI coach, recurring transactions, and marking bills paid.

**How to reach the purchase screen — three routes:**

1. **Right after onboarding.** Finish account creation and the onboarding steps; the paywall is presented automatically.
2. **From the More tab.** More → Safe Spend Premium.
3. **From any gated action.** Tap the center "+" button and try to add a transaction, or open the AI Coach from More. The paywall appears with copy matching the action attempted.

**On the purchase screen** the user selects Annual or Monthly, then taps "Start my 7-day free trial" (annual, if eligible) or "Continue". The plan cards display each plan's title, billing period, localized price and, for annual, the per-month equivalent and the exact date and amount of the first charge. Terms of Use and Privacy Policy links, the auto-renewal disclosure, and a "Restore purchases" control are all on the same screen.

**To review the purchase flow**, please create a fresh account rather than using the demo login above (the demo account is already Premium). Sandbox purchases are free and will not be charged.

---

*(End of Notes text.)*

---

## Part 2 — Screen recording shot list

**Requirements:** physical iPhone, current iOS, recorded with the built-in iOS screen recorder, starting from app launch. Target 4–7 minutes. Do not cut between scenes — one continuous take is the most convincing.

**Before you hit record**
- Install the **TestFlight** build of 2.1.8 (6). StoreKit purchases in TestFlight are automatically sandboxed and free.
- Have a fresh, unused email ready for the signup segment.
- Silence notifications (Focus mode) so nothing overlays the recording.
- If you have already used the free trial on this Apple Account, the annual card will not offer it — use a different sandbox account if you want the trial visible on camera.

**Sequence**

| # | Shot | What must be visible |
|---|---|---|
| 1 | Home screen → tap the app icon | Cold launch from the springboard, splash, Welcome screen |
| 2 | Welcome | Pick a goal (e.g. "stop overspending") |
| 3 | **Sign up** | Create an account with the fresh email — show the form and successful account creation |
| 4 | Onboarding | Currency → balance → income and payday → **the Safe-to-Spend reveal** → notification permission prompt (accept it on camera) |
| 5 | **Paywall (auto-presented)** | Slowly scroll the whole screen: both plan cards with price and period, the trial timeline, the auto-renew disclosure, the Terms and Privacy links, Restore purchases. Hold for ~5 seconds so it is readable |
| 6 | **Purchase** | Tap "Start my 7-day free trial" → the Apple purchase sheet with `[Environment: Sandbox]` → authenticate → the success/confetti screen |
| 7 | Home tab | Safe-to-Spend number, upcoming bills, recent activity |
| 8 | **Add a transaction manually** | "+" → type an amount, pick a category, save → show it appear in the list and the Safe-to-Spend number change |
| 9 | **Receipt scan** | "+" → Scan receipt → **camera permission prompt** → photograph any receipt → AI fills in the fields → save |
| 10 | Log tab | Transaction list, tap into a transaction detail, edit it |
| 11 | Budget tab | Set or adjust a category budget |
| 12 | Reports tab | Spending breakdown, health score, forecast |
| 13 | More tab | Scroll the full list so the breadth of the app is visible |
| 14 | Goals or Debts | Create one and show progress |
| 15 | Bill Calendar | Show upcoming bills, mark one paid |
| 16 | **AI Coach** | Ask one question, show the answer grounded in the user's numbers |
| 17 | **Manage subscription** | More → Premium → "Manage subscription" → show it opening Apple's subscription settings |
| 18 | **Sign out and sign back in** | Prove the login flow works with the demo credentials from the Notes |
| 19 | **Account deletion** | Profile → Delete account → the confirmation → back at the signed-out state |

Shots 3, 5, 6, 9, 16 and 19 are the ones Apple explicitly asked for. If time is short, never cut those.

**Where to put it.** Upload to a stable, publicly-viewable link (an unlisted YouTube video or a Dropbox/Drive link with link-sharing on) and paste the URL into the Notes field and into your reply to App Review. Make sure it does not expire and does not require a login.

---

## Part 3 — Pre-flight checklist

**Must do**
- [ ] Create the demo account and **seed it with realistic data** — several accounts, 30+ transactions across categories, 2–3 budgets, a couple of bills, one goal, one debt. An empty demo account reads as a broken app and is a common cause of a second rejection.
- [ ] Grant that demo account Premium so the reviewer can reach every screen without buying.
- [ ] Verify the demo credentials work on a fresh install, from a device that has never signed in.
- [ ] Fill the `[[BRACKETED]]` blanks in Part 1 — **answer item 2 truthfully.** If your iOS testing has been limited, say exactly what it was. Reviewers cross-check against crash logs, and an invented device list turns a paperwork rejection into a credibility problem.
- [ ] Record the video per Part 2, upload it, confirm the link opens in a private browser window.
- [ ] Paste Part 1 into App Review Information → Notes, add the video URL.
- [ ] Reply to the App Review message with the same information, then **Resubmit to App Review**.

No new build is required for any of the above — this is a metadata-only resubmission.

**Verified already — no action needed**

- **Guideline 3.1.2 (subscription information).** The paywall shows title, duration and localized price for both plans, an explicit auto-renewal disclosure, and links to Terms of Use and Privacy Policy — [PaywallScreen.js:359-366](src/screens/PaywallScreen.js#L359).
- **Guideline 3.1.1 (external payments).** Store naming is routed through `STORE_NAME` so the iOS build never says "Google Play", and the Buy button is disabled rather than shown broken when StoreKit is unavailable — [revenuecat.js:32](src/lib/revenuecat.js#L32), [PaywallScreen.js:316-331](src/screens/PaywallScreen.js#L316).
- **Guideline 5.1.1(v) (account deletion).** In-app deletion exists via the `delete-account` edge function — [AuthContext.js:242](src/contexts/AuthContext.js#L242).

**Worth a look before you resubmit**

- **Purpose strings (5.1.1).** Photos and Face ID strings are fine. The camera string — "Allow SafeSpend to use the camera to scan receipts." — states the what but not the outcome. Apple prefers an example of use. Consider: *"Allow Safe Spend to use the camera to photograph receipts, so the amount, merchant and category can be filled in for you automatically."* Changing this requires a new build, so only do it if you are rebuilding anyway.
- **"Coming soon" features.** `regions.js` marks SMS auto-capture, bank connection and email receipts as `coming_soon`, and the UI surfaces them. Reviewers occasionally read visible placeholder features as incompleteness under 2.1. If they are prominent in the capture UI, consider hiding them on iOS. Low risk, but it is the kind of thing that costs a second round.
- **Name consistency.** `app.json` sets the display name "Safe Spend" while the permission strings say "SafeSpend". Cosmetic only.
