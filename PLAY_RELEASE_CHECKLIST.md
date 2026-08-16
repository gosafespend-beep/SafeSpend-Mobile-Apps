# SafeSpend — Google Play closed-testing readiness

Audit + prep for uploading an Android App Bundle (**.aab**) to the Play Console and running a
**Closed testing** track. Sections marked ✅ are done in code; ☐ are your manual steps in the
Play Console / Supabase.

---

## 1. App configuration — ✅ done in this pass

| Item | Value | Notes |
|---|---|---|
| Application ID | `com.safespend.app` | matches iOS bundle id; final — cannot change after first upload |
| App name | Safe Spend | |
| Version name | `1.0.0` | user-visible |
| **versionCode** | `2` | **must increment on every upload** (3, 4, …) |
| Theme | `userInterfaceStyle: "automatic"` | fixed — was `"dark"`, which would have broken the light/system theme in a release build. Added `expo-system-ui`. |
| Icons | `icon.png`, `adaptive-icon.png` | present (1024²) |
| Splash | `splash-icon.png`, bg `#0a0d12` | present |
| Orientation | portrait | |

## 2. Permissions — ✅ audited & minimized

Final **release** manifest (dev-only perms stripped via `blockedPermissions`):

| Permission | Source | Why | Data-safety meaning |
|---|---|---|---|
| INTERNET | app | cloud sync (Supabase) | — |
| CAMERA | image-picker | **scan receipts** | Photos taken in-app |
| READ/WRITE_EXTERNAL_STORAGE | image/doc picker | pick receipt/avatar images, import CSV/Excel | Photos & files |
| POST_NOTIFICATIONS | notifications | bill reminders, budget alerts | — |
| RECEIVE_BOOT_COMPLETED | notifications | re-arm reminders after reboot | — |
| USE_BIOMETRIC / USE_FINGERPRINT | local-auth | app lock | — |
| VIBRATE | haptics | tactile feedback | — |
| ~~RECORD_AUDIO~~ | — | **removed** (blockedPermissions) | not used |
| ~~SYSTEM_ALERT_WINDOW~~ | — | **removed** from release (dev overlay only) | not used |

Every permission maps to a shipping feature — no unjustified permissions. `CAMERA` and
`POST_NOTIFICATIONS` merge in from the Expo library manifests (verified).

## 3. Build the AAB

### Option A — EAS Build (recommended: managed signing + Play App Signing)
```bash
npm i -g eas-cli
eas login                       # your Expo account
eas build -p android --profile production   # outputs a signed .aab
```
`eas.json` → `production` already produces an **AAB** with `autoIncrement`. EAS generates and
securely stores the upload keystore (you don't handle the key). Download the `.aab` from the
build page.

### Option B — Local build (no Expo account)
A **release build has been verified locally** (see status at bottom). For an *uploadable*,
properly-signed AAB you must create an upload keystore (do NOT ship the debug key):
```bash
keytool -genkeypair -v -keystore safespend-upload.jks -alias safespend \
  -keyalg RSA -keysize 2048 -validity 10000
# then add signingConfigs.release to android/app/build.gradle referencing it,
# store the password in ~/.gradle/gradle.properties (never commit it), and:
cd android && ./gradlew bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```
**Keep the keystore + passwords backed up.** (With Play App Signing you can reset a lost upload
key, but not the app signing key if you opt out of it.)

> Recommendation: use **Option A (EAS)** — it's the least error-prone path from Expo to Play.

## 4. Play Console — store listing (☐ your steps)
- ☐ App icon **512×512** PNG (separate from in-app icon)
- ☐ **Feature graphic** 1024×500
- ☐ **Phone screenshots** ×2–8 (min 320px). You can reuse the on-device captures we took
  (Dashboard, Budget, Reports/Analytics, Add sheet, Safe-to-Spend).
- ☐ Short description (≤80 chars) + Full description (≤4000)
- ☐ Category: **Finance**; contact email; **Privacy Policy URL** (see §6)

## 5. Data safety form (☐ Play Console → App content)
Declare (based on §2 + backend):
- **Collected:** email/name (account), **financial info** (transactions, budgets, goals, debts),
  **photos** (receipts, avatar), app activity.
- **Purpose:** app functionality / account management (not advertising).
- **Encrypted in transit:** Yes (HTTPS/Supabase). **Users can request deletion:** Yes — the app
  has *Delete account* (needs the `delete-account` edge fn deployed).
- **Data shared with third parties:** none for ads. (Supabase = processor; AI receipt/category
  calls go to the AI gateway — disclose as a service provider processing the image/text.)
- **No** location, contacts, or audio.

## 6. App content declarations (☐)
- ☐ **Privacy policy** live + reachable at `https://gosafespend.com/privacy` (currently linked
  in-app — **confirm the page actually exists**; Play rejects dead/placeholder policies).
- ☐ **Ads:** No.
- ☐ **Content rating** questionnaire → will rate ~Everyone (finance, no sensitive content).
- ☐ **Target audience:** 18+ (financial app) — avoids extra kids-policy requirements.
- ☐ **Financial features** declaration: it's a personal budgeting tool (not a bank / not
  handling payments in-app beyond the subscription) — declare the Paystack subscription honestly.
- ☐ **Government app / COVID:** No.

## 7. Closed testing setup (☐)
- ☐ Create a **Closed testing** track → upload the `.aab`.
- ☐ Add testers: an email list or a **Google Group**; testers must **opt in via the test link**.
- ⚠️ **Policy for newer personal developer accounts:** Google requires **≥12 testers opted in
  for 14 continuous days** before you can promote to production. Line up your 12 testers now.
- ☐ Fill the release notes for the track.
- ☐ Review the **Pre-launch report** (Google auto-runs the app on real devices — catches crashes).

## 8. Backend prerequisites (so the release build fully works)
- ☐ **Supabase Auth → URL Configuration:** add `safespend://` (and `safespend://*`) to the
  **Redirect URLs allow-list**, or Google sign-in will fail in the store build.
- ☐ Deploy edge functions: **`parse-receipt`** (receipt scan) and **`delete-account`** (required
  for the Data-safety "delete" claim). `receipts` migration is already applied.
- ☐ Confirm the Supabase project isn't paused and RLS is on (it is).

## 9. Code TODOs before wider rollout (not blockers for closed test)
- Add a proper **monochrome notification icon** (currently uses the app icon silhouette).
- **Localize subscription pricing** (Paywall is hardcoded USD) or clarify currency.
- **Enforce or soften** the advertised free-tier limits ("2 accounts max" isn't enforced).
- Delete leftover test transactions (Coffee $4.50, Mshwari $300).
- ~~Target API level~~ — **done:** now targets **35** via `expo-build-properties` + patch-package.

---

## Status — UPLOADABLE AAB READY ✅

**The signed, Play-ready bundle is at `C:\Users\Administrator\Downloads\SafeSpend-release.aab`**
(~36 MB). Upload *this* file to the Internal/Closed testing track.

- ✅ Config, permissions, theme, versioning fixed.
- ✅ **Release AAB built & signed with the SafeSpend upload keystore** (not debug). Merged
  manifest verified: **versionCode 2**, **targetSdk 35** (meets Play's current requirement),
  minSdk 23, RECORD_AUDIO + SYSTEM_ALERT_WINDOW stripped, CAMERA + POST_NOTIFICATIONS present.
  Signer: `CN=SafeSpend`.
- 🔑 **Upload keystore:** `C:\safespend\keys\safespend-upload.jks` — alias `safespend-upload`,
  password `SafeSpend2026!`. **BACK THIS UP** (offline + password manager). Signing creds live in
  `android/gradle.properties` (do NOT commit to a public repo).
- 🐞 **Fixed a release-only blocker:** `assets/logo-shield.png` was actually a **JPEG** with a
  `.png` extension — the release AAPT compiler rejected it. Re-encoded to a real PNG.
- 🩹 **SDK-35 durability fix (patch-package):** Expo 51's `expo-modules-core` doesn't compile
  against API 35 (`PermissionsService.kt` nullable-receiver error). Patched to
  `requestedPermissions?.contains(permission) ?: false` and made **durable** via
  `patches/expo-modules-core+1.12.26.patch` + a `postinstall: patch-package` script — so
  `npm install` and **EAS builds re-apply it automatically** (won't silently break again).
- `DUMP` appears in the manifest — a benign signature-level permission; ignore it.

### ⚠️ Two things that change between local and EAS builds
1. `android/app/build.gradle` and `android/gradle.properties` signing edits are **wiped by
   `expo prebuild`** — they must be re-applied if you regenerate the `android/` folder locally.
2. **EAS build** uses its own managed keystore (Option A) — different signer than the local one.
   Pick ONE signing path and stick to it; don't mix a local-signed and an EAS-signed AAB on the
   same track without Play App Signing reconciling them.

**Next action for you:** upload `SafeSpend-release.aab`, then work through §4–§8 in the Play
Console (Data safety, content rating, target audience 18+, privacy policy URL, testers).
