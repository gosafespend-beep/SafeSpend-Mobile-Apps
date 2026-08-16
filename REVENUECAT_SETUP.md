# SafeSpend — RevenueCat + Google Play Billing setup (complete guide)

Goal: finish switching the **mobile** app's Premium subscription from Paystack to
**Google Play Billing via RevenueCat**, and complete a real (free) test purchase on
the Internal testing track.

Legend: **[You]** = you, in a browser dashboard · **[Claude]** = I do it in code · ✅ = already done.

---

## Where we are

✅ App code is fully integrated and JS-validated (SDK, purchase/restore/cancel,
entitlement gating, localized prices). The only placeholder is the RevenueCat
**API key** in `src/lib/revenuecat.js`. Nothing works at runtime until the steps
below are done and a new build is uploaded.

The remaining work is mostly **dashboard configuration** (Play + RevenueCat) plus
one **rebuild**. Do Part A and Part B in parallel; they meet at Part D.

---

## Part A — Google Play Console: create the products  **[You]**

> Prerequisite: a **Payments profile / merchant account** must exist
> (Play Console → *Setup → Payments profile*). You can't create paid products
> without it. If it's not set up, do that first.

1. Play Console → **Monetize → Products → Subscriptions** → **Create subscription**.
2. **Monthly** product:
   - Product ID: `safespend_premium_monthly`  ← must match exactly (can't change later)
   - Name: `SafeSpend Premium (Monthly)`
   - Add a **base plan** → ID `monthly` → **Auto-renewing**, billing period **Monthly**.
   - Set the price → **Activate** the base plan → **Activate** the subscription.
3. **Annual** product (repeat):
   - Product ID: `safespend_premium_annual`
   - Name: `SafeSpend Premium (Annual)`
   - Base plan ID `annual` → Auto-renewing, billing period **Yearly** → price → Activate.
4. (Optional) Add a **free trial** or **intro offer** on either base plan under *Offers*.

> Products can take a few hours to become purchasable after activation. That's normal.

---

## Part B — Service account so RevenueCat can talk to Play  **[You]**

RevenueCat validates purchases server-side using a Google service account.

1. Play Console → **Setup → API access**. Link/create a Google Cloud project if asked.
2. **Create new service account** → opens **Google Cloud Console**.
3. In Cloud Console: **Create service account** (name e.g. `revenuecat-safespend`) → **Done**.
4. That service account → **Keys** tab → **Add key → Create new key → JSON** →
   downloads a `.json` file. **Keep it — you upload it to RevenueCat.**
5. Back in Play Console → **API access** → find the account → **Grant access**, give:
   - **View financial data, orders, and cancellation survey responses**
   - **Manage orders and subscriptions**
   - Save.

---

## Part C — RevenueCat dashboard  **[You]**

1. Sign in at app.revenuecat.com → create a **Project** (e.g. "SafeSpend").
2. **Project settings → Apps → + New → Play Store**:
   - App name: `SafeSpend Android`
   - Google Play package: `com.safespend.app`
   - Upload the **service account JSON** from Part B.
3. **Entitlements** → **+ New** → identifier exactly: **`premium`**  ← the app checks this.
4. **Products** → **+ New** (or **Import**) → add both Play products:
   - `safespend_premium_monthly`
   - `safespend_premium_annual`
5. Attach **both** products to the **`premium`** entitlement
   (Entitlements → premium → Attach products).
6. **Offerings** → open the **default** offering (create one if none) → **+ Package**:
   - Package **Monthly** → attach `safespend_premium_monthly`
   - Package **Annual** → attach `safespend_premium_annual`
   > The app looks for the offering's Monthly/Annual packages by their standard type,
   > so use the built-in "Monthly" and "Annual" package identifiers.
7. **Project settings → API keys** → copy the **Android** public key (starts with `goog_`).

**➡️ Send me that `goog_...` key.**

---

## Part D — Code + build  **[Claude]**

When you give me the key I will:

1. Paste it into `src/lib/revenuecat.js` (replaces `goog_REPLACE_WITH_YOUR_ANDROID_KEY`).
2. Bump **versionCode 3 → 4** in `app.json` and `android/app/build.gradle`.
3. Rebuild the signed AAB (`gradlew bundleRelease`) — this build contains the
   Play Billing library. Output copied to `Downloads\SafeSpend-release.aab`.

*(You can also do step 1 yourself: edit the `android:` line in
`src/lib/revenuecat.js`. But let me do the build — it needs the signing keystore.)*

---

## Part E — Upload & enable testing  **[You]**

1. Play Console → **Testing → Internal testing → Create new release** → upload the
   new AAB (versionCode 4) → add release notes → **Save → Review → Start rollout**.
2. **Testers:** on the Internal testing track, add your Google account to the testers
   list (email list or Google Group). Copy the **opt-in link**.
3. **License testing (free test purchases):** Play Console → **Setup → License testing**
   → add the same Gmail account(s) → set **License response: RESPOND_NORMALLY** → Save.
   This makes purchases go through the real flow but **without charging** (test card).
4. On your phone: open the **opt-in link**, accept testing, then **install SafeSpend
   from Google Play** (must be the Play install, not a sideload — Billing only works
   for a Play-delivered, Play-signed build).

---

## Part F — Test the purchase  **[You]**

1. Open the app → go to the **Paywall** (Premium screen).
2. Prices should show in your local currency (pulled from Play). If they don't, see
   Troubleshooting.
3. Pick a plan → **Upgrade to Premium** → the Google Play purchase sheet appears →
   confirm (it'll say it's a test, no charge).
4. You should return to "You're all set", and the Premium badge appears in More/Profile.
5. Test **Restore purchases** (should re-grant instantly).
6. Test **Manage subscription** → opens the Play subscriptions page.
7. Verify in **RevenueCat → Customer history** that the transaction shows up.

---

## Part G — (Recommended, not a blocker) sync purchases to Supabase  **[Claude + You]**

So the **web app** also recognizes mobile purchases and there's one source of truth:
deploy a **RevenueCat webhook** that upserts the `subscriptions` table on
purchase/renewal/cancel. I can write this edge function; you add the webhook URL in
RevenueCat → Project settings → Integrations → Webhooks. Until then, the app's
"entitlement OR Supabase table" logic covers mobile correctly.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Prices don't load / "plan not available" | Products not **Active** yet, or offering packages not attached, or the app build isn't on a track Google has finished processing. Wait a few hours after activating products. |
| "This item isn't available" / error opening purchase sheet | Tester account not opted into the track, app not installed **from Play**, or signing-key mismatch. Confirm you installed via the opt-in link. |
| Purchase works but no Premium | The product isn't attached to the **`premium`** entitlement in RevenueCat. |
| Got charged / no test card | The account isn't in **License testing**, or not RESPOND_NORMALLY. |
| RevenueCat shows nothing | Service account JSON missing permissions (Part B step 5) or wrong package name. |

---

## Quick checklist

- [ ] Payments profile exists
- [ ] `safespend_premium_monthly` + `safespend_premium_annual` created & **active**
- [ ] Service account JSON created, permissions granted, uploaded to RevenueCat
- [ ] RevenueCat: `premium` entitlement + both products attached
- [ ] RevenueCat: default Offering with Monthly + Annual packages
- [ ] Android `goog_` key sent to Claude
- [ ] Rebuilt AAB (versionCode 4) uploaded to Internal testing
- [ ] License tester added (RESPOND_NORMALLY) + opted into track
- [ ] Installed from Play → test purchase succeeds → shows in RevenueCat
