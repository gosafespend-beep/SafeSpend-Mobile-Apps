# SafeSpend — iOS Release Runbook

iOS is built from **this folder** (Expo SDK 54 / RN 0.81 / New Architecture) via **EAS Build**
(cloud Macs — no Mac needed). iPad support is **on** (`supportsTablet: true`).

## The core constraint
Windows cannot generate or compile the iOS project. `ios/` is **not committed** — EAS runs
`expo prebuild --platform ios` in the cloud from `app.json` + plugins at build time. So all iOS
setup is declarative config (done) plus Apple-side account work (below).

---

## ✅ Phase 1 — Code & config (DONE, verified on Windows)
- `app.json` iOS: `bundleIdentifier com.safespend.app`, `buildNumber "1"`, `supportsTablet true`,
  `ITSAppUsesNonExemptEncryption: false` (skips the encryption questionnaire — app uses only
  exempt standard crypto: HTTPS + Keychain).
- Permission strings come from Expo plugins: photos/camera (`expo-image-picker`), Face ID
  (`expo-local-authentication`). Notifications → APNs (EAS manages the push key).
- `eas.json`: iOS `production` build + `submit` block (fill the 3 Apple IDs below).
- App icon: 1024×1024, RGB, **no alpha** — compliant.
- iOS JS bundle builds clean (1814 modules). Only 4 Android-only branches in JS, all guarded.
- RevenueCat: iOS key slot present in `src/lib/revenuecat.js` (empty → falls back to Supabase
  entitlement until you add the `appl_` key in Phase 3).
- The Android home-screen widget has **no iOS equivalent** — an iOS WidgetKit widget is a
  separate future task, not required to ship.

---

## Phase 2 — Apple account ↔ EAS
1. `npm i -g eas-cli` (if needed); `eas login`.
2. `eas credentials` → iOS → let EAS create the **Distribution certificate**, **provisioning
   profile**, and **APNs push key** automatically (it prompts for Apple login once).
3. Get your **Apple Team ID** (App Store Connect → Membership) → put in `eas.json`
   `submit.production.ios.appleTeamId` and your Apple ID email in `appleId`.

## Phase 3 — In-App Purchase (required; Apple mandates StoreKit for the subscription)
1. App Store Connect → **Agreements** → sign **Paid Applications**; add **banking + tax**.
2. Create two **auto-renewable subscriptions** in a subscription group, matching Android:
   - Monthly — **$9.99/mo**
   - Annual — **$89.99/yr** (7-day free trial on annual only, to match)
3. RevenueCat dashboard → add the **iOS app** (bundle `com.safespend.app`) → paste the App Store
   Connect shared secret → map the two products into the **existing offering** (`monthly`,
   `annual` packages) so the paywall "just works".
4. Copy the RevenueCat **iOS public key** (`appl_…`) into `src/lib/revenuecat.js` (`ios:` field).

## Phase 4 — App Store Connect listing
- Create the app record (bundle `com.safespend.app`, name "Safe Spend").
- **Privacy policy URL** — `https://gosafespend.com/privacy-policy` (live, updated 2026-01-30).
  Terms: `https://gosafespend.com/terms-of-service` (live). The app now links both correctly.
  Note: the bare `/privacy` and `/terms` paths 404 — use the full paths above in the listing.
- **App Privacy** nutrition labels — declare financial data collection (Supabase), analytics,
  and any third-party (RevenueCat).
- **Screenshots** — iPhone 6.9"/6.7" + 6.5", **and iPad** (12.9"/13") since iPad support is on.
- Age rating, category (Finance), **a demo login for reviewers** (finance apps get scrutiny),
  support URL, keywords.

## Phase 5 — Build → TestFlight → Review
```bash
eas build --platform ios --profile production      # cloud build → .ipa
eas submit --platform ios --profile production      # → TestFlight
```
- QA on a real iPhone/iPad via TestFlight (New-Arch + first-ever iOS run will surface bugs):
  purchase flow (sandbox), Face ID unlock, notifications, image picker/camera, safe-area under
  the notch/Dynamic Island, and every screen.
- Then submit for App Store review from App Store Connect.

## Costs (recap)
Apple Developer Program $99/yr (you have it) · EAS Build free tier or ~$99/mo for volume ·
Apple takes 15% (Small Business < $1M) to 30% of IAP revenue.
