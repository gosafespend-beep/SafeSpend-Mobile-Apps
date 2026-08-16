# Safe Spend — Mobile (iOS + Android)

A native mobile app built with **Expo / React Native**, ported pixel-faithfully
from the Safe Spend design system handoff. This is the phone companion to the
existing web app at gosafespend.com — it targets **iOS and Android only**.

All 22 screens from the design kit are implemented: the five tabs (Home, Log,
Budget, Reports, More), every More drill-in (Accounts, Bill calendar, Debt
tracker, Goals, Categories, Profile & settings, Notifications, Upgrade/Paywall,
States gallery, Search), the four detail screens (Transaction, Account, Goal,
Debt), the Auth and Onboarding gates, and the Add-transaction bottom sheet.

## Requirements

- Node.js 18+ and npm
- The **Expo Go** app on your phone (App Store / Play Store), or an iOS
  Simulator / Android emulator

## Run it

```bash
npm install
# align native module versions to your installed Expo SDK (recommended):
npx expo install --fix
npx expo start
```

Then scan the QR code with Expo Go (Android) or the Camera app (iOS), or press
`i` / `a` in the terminal to open a simulator/emulator.

> The first screen is the **Auth** gate — tap *Sign In with Email* (or Google)
> to continue, run through onboarding (or *Skip setup*), and you land on the
> dashboard. The **+** button opens the Add-transaction sheet.

## Build for the stores

This is a standard Expo managed app. Use EAS Build:

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

Bundle identifiers are preset to `com.safespend.app` in `app.json` — change
these to your own before submitting.

## Project structure

```
App.js                       # font loading + providers + status bar
src/
  theme/tokens.js            # color tokens, type, radii, shadows (dark-only)
  lib/format.js              # currency / number formatting
  components/
    Icon.js                  # Lucide glyphs via react-native-svg
    index.js                 # Header, TabBar, Fab, Card, StatCard, ListRow,
                             # ProgressBar, RingProgress, Donut, Sparkline,
                             # Badge, Button, Input, SectionHeader,
                             # PeriodPill, Toggle
  navigation/RootNavigator.js# tab + sub + detail routing, auth/onboarding gates
  screens/                   # all 22 screens (one file each)
assets/                      # logo + app icons
```

## Design fidelity notes

- **Dark-only**, deep blue-black surfaces + emerald accent, exactly per the kit.
- **Inter** for UI, **JetBrains Mono** (tabular-nums) for every monetary figure,
  loaded via `@expo-google-fonts`.
- The CSS `conic-gradient` spending donut is rendered with `react-native-svg`
  arc wedges; ring progress, sparkline, and all icons are SVG too.
- Gradients use `expo-linear-gradient`; the glassy header/tab bar use a
  near-opaque surface tint (no `backdrop-filter` on native).
- Safe-area insets are respected on both platforms; the Android hardware back
  button unwinds sheet → detail → sub-screen → home.

## Navigation

To keep first-run reliable and the port faithful, navigation is a lightweight
state machine in `RootNavigator.js` (tabs + drill-in + details + modal sheet),
mirroring the prototype's `App.js`. If you'd prefer native gestures and
deep-linking later, this maps cleanly onto **React Navigation**: make each tab a
`Bottom Tab` screen, push the sub/detail screens onto a `Native Stack`, and turn
the `AddSheet` into a transparent modal route. The screen components already take
simple callback props (`onOpen`, `onOpenTxn`, `onNavigate`), so swapping in
`navigation.navigate(...)` is a small change.

## Wiring real data

Every screen currently renders the seed data from the design kit. Replace the
in-file arrays with your API/store (the web app's backend) and pass real objects
into the detail screens via the `txn` / `account` / `goal` / `debt` props that
each already accepts.
