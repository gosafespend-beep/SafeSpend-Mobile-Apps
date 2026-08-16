# SafeSpend — Expo 54 / Android 16 (API 36) upgrade

This folder is the **API 36 upgrade**, kept separate from the stable build for
**internal testing first**. Do not push this to closed/production testing until it
has been exercised on a real Android 16 device.

- **This folder** (`SafeSpendMobile-expo54`): Expo SDK 54, React Native 0.81.5,
  React 19, New Architecture, **targetSdk/compileSdk 36**. Version **2.1.8 / versionCode 45**.
- **Stable folder** (`../SafeSpendMobile`): Expo SDK 51, RN 0.74.5, **targetSdk 35**.
  Version **2.1.7 / versionCode 44** — the build currently in **closed testing**.
  Keep shipping from there while this one is validated.

## Why this upgrade exists
Google Play requires phone/tablet app updates to target **API 36 by Aug 31, 2026**
(extension available to Nov 1). The stable stack (AGP 8.2.1) can't compile SDK 36,
so an Expo SDK upgrade was required. See `../` memory `expo54-android16-upgrade`.

## Status
- JS bundle builds clean (1823 modules); 57/57 unit tests pass.
- Release AAB builds against Android 16 with New Architecture.
- **NOT device-verified.** New Architecture is a real runtime change. Before promoting,
  test on an Android 16 device: FlashList v2 (transaction list), gesture-handler
  swipe-to-delete, the RevenueCat paywall, and every screen's look under the system
  bars (edge-to-edge is mandatory on Android 16).

## Build
```
npx expo prebuild --platform android --no-install   # DIRTY prebuild — preserves the widget
cd android && ./gradlew bundleRelease
```
Output: `android/app/build/outputs/bundle/release/app-release.aab`

## ⚠️ Home-screen widget is hand-maintained (no config plugin)
`SafeSpendWidget.kt` + `res/{drawable/widget_bg,layout/widget_safespend,xml/widget_safespend_info}.xml`
+ 5 `widget_*` strings + a `<receiver>` in AndroidManifest.xml.
A **`--clean`** prebuild WIPES all of it; a **dirty** prebuild (above) preserves it.
TODO: wrap the widget in an Expo config plugin so `--clean` is safe.

## Install-tree requirements (already applied here)
- `.npmrc` has `legacy-peer-deps=true` (React 19 peer conflict).
- `promise@^8.3.0` is a direct dep (RN 0.81 didn't hoist it; Sentry needs it to bundle).
