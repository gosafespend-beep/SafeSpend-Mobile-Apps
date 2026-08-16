# Service account `revenuecat-safespend` — click-by-click (novice)

This connects Google Play → RevenueCat so RevenueCat can read your purchases.
You'll do it in TWO websites: **Google Play Console** and **Google Cloud Console**.
Have both open. Total time ~15 min. Do the steps IN ORDER.

Sign in everywhere with the SAME Google account that owns the Play developer account
(samuelmakuthuluka@gmail.com).

---

## STAGE 1 — Start in Play Console (link Google Cloud)

1. Go to **https://play.google.com/console**.
2. Left sidebar, scroll to the bottom → click **Setup** → **API access**.
   (If you don't see "Setup", click the hamburger/menu icon top-left first.)
3. First time only: it says you need a Google Cloud project.
   - If you already have one, click **Link existing project** and pick it.
   - If not, click **Create new project** → wait a few seconds → it links automatically.
4. The page reloads and now shows sections including **Service accounts**.
   Leave this tab OPEN. You'll come back in Stage 3.

---

## STAGE 2 — Create the service account in Google Cloud

5. On that same API access page, in the **Service accounts** area click
   **Create new service account**. A popup appears with a link to Google Cloud.
6. Click the link **Google Cloud Platform** (opens a new tab at
   console.cloud.google.com, on the "Service accounts" screen).
   - IMPORTANT: at the very top, make sure the **project name** matches the one you
     linked in step 3. If a different project is shown, click the project dropdown at
     the top and choose the linked one.
7. Click **+ CREATE SERVICE ACCOUNT** (top of the page).
8. **Service account details:**
   - Service account name: type **revenuecat-safespend**
   - Service account ID: it auto-fills to `revenuecat-safespend` — leave it.
   - Description: (optional) `RevenueCat purchase validation`
   - Click **CREATE AND CONTINUE**.
9. **Grant this service account access to project (optional):**
   - You do NOT need a role here. Click **CONTINUE**.
10. **Grant users access (optional):** leave blank → click **DONE**.
11. You're back at the Service accounts list. You'll see a row:
    `revenuecat-safespend@<your-project>.iam.gserviceaccount.com`. 

---

## STAGE 3 — Download the JSON key

12. Click the **revenuecat-safespend** row (the email) to open it.
13. Go to the **KEYS** tab (top).
14. Click **ADD KEY** → **Create new key**.
15. Choose **JSON** → click **CREATE**.
16. A `.json` file **downloads to your computer** (e.g.
    `your-project-abc123.json` in your Downloads folder).
    ⚠️ This file is a secret — don't email it or commit it anywhere public.
    You'll upload it to RevenueCat in Stage 5. Keep it safe.

---

## STAGE 4 — Give the service account permission (back in Play Console)

17. Go back to the **Play Console → Setup → API access** tab (from Stage 1).
    If the new service account isn't listed yet, refresh the page.
18. Find **revenuecat-safespend@...** in the Service accounts list →
    click **Manage Play Console permissions** (or **Grant access**).
19. Go to the **Account permissions** tab and TICK these two boxes:
    - **View financial data, orders, and cancellation survey responses**
    - **Manage orders and subscriptions**
    (Leave everything else unticked.)
20. Click **Invite user** / **Apply** / **Save changes** (button name varies).
    Done — the service account can now read your subscriptions.

---

## STAGE 5 — RevenueCat (create project + connect Play)

21. Go to **https://app.revenuecat.com** → sign up or sign in.
22. Create a **Project** → name it **SafeSpend** → Create.
23. Left sidebar → **Project settings** → **Apps** → **+ New** → choose
    **Google Play Store**.
24. Fill in:
    - **App name:** `SafeSpend Android`
    - **Google Play package name:** `com.safespend.app`  (type it EXACTLY)
    - **Service Account Credentials JSON:** click the upload box → select the `.json`
      file you downloaded in Stage 3 (step 16).
    - (Leave "Financial reports bucket ID" blank.)
    - Click **Save changes**.
    > RevenueCat may show "waiting for permissions to propagate" — it can take up to
    > 24–36 hours for Google to fully activate the credentials, but usually works
    > within an hour. You can keep going.

---

## STAGE 6 — Entitlement, Products, Offering (in RevenueCat)

> Do this AFTER you've created the two subscription products in Play Console
> (`safespend_premium_monthly`, `safespend_premium_annual`).

25. **Entitlements** (left sidebar) → **+ New**:
    - Identifier: **premium**  (lowercase, exactly — the app checks this word)
    - Description: `Full access` → **Add**.
26. **Products** (left sidebar) → **+ New Product** (do this twice):
    - Product 1 → Store: Play Store → Product ID: `safespend_premium_monthly` → Add.
    - Product 2 → Store: Play Store → Product ID: `safespend_premium_annual` → Add.
27. Attach products to the entitlement:
    - Open **Entitlements → premium** → **Attach** → select BOTH products → Save.
28. **Offerings** (left sidebar):
    - If there's no offering, click **+ New Offering** → Identifier: `default` → Add.
    - Open the `default` offering → **+ New Package** twice:
      - Package → choose **Monthly** → attach `safespend_premium_monthly` → Save.
      - Package → choose **Annual** → attach `safespend_premium_annual` → Save.

---

## STAGE 7 — Get the key for the app

29. **Project settings → API keys**.
30. Find the **Public app-specific API key** for your **Android / Play Store** app.
    It starts with **`goog_`**.
31. Click to reveal/copy it.
32. **Send that `goog_...` key to Claude.** I paste it into the app, rebuild the
    final AAB (versionCode 5), and you upload it — then you can do a real test purchase.

---

## If something looks different
Google changes button labels often. The NAMES to look for don't change:
"API access", "service account", "Create new key → JSON", "View financial data",
"Manage orders and subscriptions", entitlement "premium", package "com.safespend.app",
API key starting "goog_". If a screen doesn't match, tell me exactly what you see.
