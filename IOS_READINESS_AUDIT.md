# SafeSpend iOS Readiness Audit (2026-07-31)

---

## FINAL SUBMISSION CHECKLIST (verified from scratch 2026-07-31)

**Code + configuration is 100% complete.** Everything remaining is content/
attestation you create in the dashboards, plus one rebuild. Verified live in App
Store Connect / Apple portal / Supabase.

### ✅ Done (verified)
- **App record** (Apple ID 6796527654), bundle `com.safespend.ios`, Free, 175 regions,
  age 4+, categories, metadata (description 1,562 chars / keywords / subtitle / URLs /
  copyright), privacy-policy URL. Export compliance handled in app.json.
- **Sign in with Apple** — code + `usesAppleSignIn` entitlement + **Apple App ID
  capability enabled** + **Supabase Apple provider enabled** (Client ID
  com.safespend.ios). buildNumber 4 (EAS auto-increments → 5 on build).
- **IAP** — subscription group + Monthly $9.99 + Annual $89.99 (7-day trial), localized,
  all regions; RevenueCat: both iOS products created, attached to `premium`, in the
  Monthly/Annual offering packages. Tax category = match parent app.
- **App Privacy** — 6 data types configured (name/email/user-id/financial/purchases/
  product-interaction; app-functionality, linked, no tracking).
- **Agreements + Banking/Tax** — done (user).
- All the code-compliance items below (StoreKit, restore, Apple manage-URL, disclosures,
  account deletion, permission strings, safe-area, Android-only features inert on iOS).

### ⚠️ Remaining — all content/attestation (yours) + one rebuild
1. **App screenshots** — version 1.0 page shows **0 of 3** (iPhone 6.5" = 1242×2688 or
   1284×2778). Min 3. Needs an iOS device/simulator or a screenshot tool (you're on
   Windows/Android, so this needs a Mac/simulator or a framing service).
2. **Subscription review screenshots** — BOTH Monthly + Annual → *Review Information →
   Screenshot* is empty ("Choose File"). A single paywall screenshot works for each.
   Required before the subscriptions can be submitted.
3. **Demo account for App Review** — version page *App Review → Sign-In Information*
   says "Sign-in required." The app is login-gated, so create a demo account (email +
   password with a little sample data) and enter its credentials there (Guideline 2.1).
4. **App Privacy → Publish** — configured but not published; click **Publish** (it's an
   accuracy attestation, so it's yours to confirm).
5. **EAS rebuild + attach** — `eas build -p ios --profile production` (regenerates the
   provisioning profile with the new Sign-in-with-Apple entitlement, produces build 5
   with the Apple button), then attach that build to version 1.0 (currently build 3).
6. **Submit together** — when you click "Add for Review", include the subscription group
   so Apple reviews the IAPs with the app ("first subscription must be submitted with a
   new app version").

_None of items 1–6 are things I can complete for you — they need an iOS device
(screenshots), your credentials (demo account), your attestation (privacy), or a
deliberate build-slot (rebuild). Everything I *could* do is done._

---


Line-by-line pass of `SafeSpendMobile-expo54` for iOS/App-Store fitness. Verdict:
**one real blocker (Sign in with Apple), a couple of minor polish items — everything
else is genuinely iOS-ready.**

---

## 🔴 Blocker — must fix before submission

### 1. Sign in with Apple missing (Guideline 4.8)
`AuthScreen.js` offers **email/password + "Continue with Google"** but **no Sign in
with Apple**. Apple's 4.8 requires that if you offer a third-party/social login
(Google), you must also offer an equivalent privacy-preserving option — **Sign in
with Apple** is the standard way to satisfy it. This is a near-certain rejection.

**Recommended fix: add Sign in with Apple (keep Google).** Hiding Google on iOS
would lock out users who created their account with Google (they have no password),
so removing it is the wrong call for a cross-platform account system.

Implementation needs three parts:
- **Code:** `expo-apple-authentication` → an iOS-only Apple button →
  `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken })`.
- **app.json:** add the `expo-apple-authentication` plugin + the
  `com.apple.developer.applesignin` entitlement.
- **Config (needs your accounts):** enable **Sign in with Apple** capability on the
  `com.safespend.ios` App ID (Apple Developer portal), and enable the **Apple**
  provider in Supabase Auth (Services ID + key). This is the part I can't do without
  your Apple/Supabase sign-in.

---

## 🟡 Minor — polish, not rejections

### 2. Biometric wording says "fingerprint or face" on iOS
`LockScreen.js`, `ProfileScreen.js`, `OnboardingScreen.js` say "fingerprint or
face." iPhones use **Face ID / Touch ID** (no "fingerprint"). Not a rejection, but
unpolished on iOS. Fix: branch the copy on `Platform.OS`/
`LocalAuthentication.supportedAuthenticationTypesAsync()` → "Face ID" / "Touch ID".
(The `faceIDPermission` usage string is already set in app.json ✅.)

### 3. App-icon quick actions won't appear on iOS
Launcher shortcuts (`safespend://add|scan`) are wired via Android `shortcuts.xml`.
iOS Home-Screen quick actions need `expo-quick-actions` (or `UIApplicationShortcutItems`).
The deep-link *handler* works; only the long-press shortcuts are absent on iOS.
Feature gap, not a blocker — add later.

### 4. Paystack cancel path reachable on iOS for web-subscribed users
`EntitlementContext.cancel()` correctly sends **store** subscribers to the Apple
Account page. But a user whose Premium came from the **web** app (Paystack, not
`rcActive`) would hit the `paystack-manage` cancel path on iOS. It's not a *purchase*
flow (so not a hard 3.1.1 violation) and is an edge case, but to be safe you could
hide the in-app cancel on iOS for non-store subs and show "manage on the web" instead.

---

## ✅ Verified iOS-ready (no action)

- **Native config** (`app.json`): bundle `com.safespend.ios`, `buildNumber` 3,
  `usesNonExemptEncryption:false` + `ITSAppUsesNonExemptEncryption:false` (skips the
  export-compliance prompt), camera/photos/Face ID usage strings all present,
  `supportsTablet`, `scheme: safespend` for deep links.
- **In-app purchases / App Review 3.1.1 & 3.1.2:** purchases via StoreKit
  (`Purchases.purchasePackage`), **Restore purchases** present, `canPurchase` gates
  the CTA so no dead Buy button, cancel deep-links to the **Apple Account**
  (`manageSubscriptionsUrl` → `apps.apple.com/account/subscriptions` on iOS), paywall
  shows the auto-renew disclosure + Terms + Privacy, all store wording routed through
  the `STORE_NAME`/`STORE_ACCOUNT` abstraction (never hardcodes "Google Play" in
  user-facing text). RevenueCat iOS key wired + configured at startup.
- **Guideline 2.3.1 (other stores):** the only "Google" in the UI is Google *Sign-In*
  (allowed) and authenticator-app names; billing copy uses the abstraction.
- **Guideline 5.1.1(v) account deletion:** in-app `deleteAccount` (delete-account edge fn).
- **Android-only features are iOS-safe:** home-screen widget is fed via a plain
  `AsyncStorage.setItem` (no-op on iOS; native widget lives only in `android/`); SMS
  capture is a **pure-JS parser of pasted text** (no native SMS module, no permission);
  no unguarded Android `NativeModule` calls anywhere.
- **Layout:** `SafeAreaProvider` + `useSafeAreaInsets` across the shell (notch/home
  indicator), `KeyboardAvoidingView behavior='padding'` on iOS in every sheet,
  `shadow()` helper carries both iOS shadow props and Android `elevation`, themed
  `expo-status-bar`.
- **Platform guards:** `notifications.js` gates `AndroidImportance`/channels behind
  `Platform.OS==='android'`; `locale.js` uses `SettingsManager` on iOS; date picker
  keeps-open logic branches on iOS; `Sharing.isAvailableAsync()` checked before share.
