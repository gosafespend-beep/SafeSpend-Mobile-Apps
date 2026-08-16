# RevenueCat → Supabase webhook — setup & web-agent coordination

Server-truth entitlement for mobile (Google Play / RevenueCat) purchases, so the
**web app can see mobile subscriptions**. Closes Tier 2, finding #6 of
`SUBSCRIPTION_AUDIT.md`.

Deliverables in this repo, ready to deploy:
- Edge function: [`supabase/functions/revenuecat-webhook/index.ts`](supabase/functions/revenuecat-webhook/index.ts)
- Table migration: [`supabase/migrations/20260710000000_revenuecat_entitlements.sql`](supabase/migrations/20260710000000_revenuecat_entitlements.sql)

---

## Message for the web agent

> **Subject: RevenueCat → Supabase webhook for mobile subscriptions — need your call on the entitlement table**
>
> The SafeSpend **mobile** app now sells Premium via Google Play / RevenueCat
> (7-day annual trial → read-only wall). Entitlement is trusted on-device via the
> RC SDK, but there's no server record yet — so **the web app can't see a user's
> mobile subscription**. I want to close that with a RevenueCat webhook that writes
> entitlement into Supabase.
>
> **The coordination point:** the existing `subscriptions` table is one row per
> user and is written by the **web Paystack flow**. If the RC webhook also writes
> that row, the two payment sources fight over it (a user with both, or an
> out-of-order event, could clobber the other platform's state). So I need your
> decision on the model:
>
> - **Option A (my recommendation): a dedicated `revenuecat_entitlements` table.**
>   The webhook writes only there; Paystack keeps `subscriptions` untouched. Each
>   app treats a user as Premium if an **active row exists in either** table.
>   Migration + function are written and attached — least disruptive, zero risk to
>   your Paystack writes.
> - **Option B: add a `provider` column to `subscriptions`** (`'paystack' | 'play'`)
>   and key on `(user_id, provider)`. Cleaner single-table model, but it changes
>   your reads — anything doing `.maybeSingle()` on `subscriptions` must become
>   "is there **any** active row" (mobile does this too). More invasive; your call.
>
> If you're good with **Option A**, the only thing you (or I) need to do web-side
> is: when resolving a user's plan, also check `revenuecat_entitlements` for an
> `is_active = true` row and treat it as Premium. Read shape:
> `{ status, is_active, period_type, product_id, expires_at, environment }`,
> keyed by `user_id`.
>
> **Deploy** (needs the shared Supabase project — either you run it, or grant me
> CLI access):
> 1. `supabase db push` (applies the `revenuecat_entitlements` migration), or run the SQL by hand.
> 2. `supabase functions deploy revenuecat-webhook --no-verify-jwt` — **the
>    `--no-verify-jwt` is required**: RevenueCat isn't a Supabase-authenticated
>    caller; it sends its own Authorization secret, which the function validates
>    itself. With JWT verification on, Supabase would reject every RC request.
> 3. `supabase secrets set RC_WEBHOOK_SECRET='<long random string>'`.
>
> Once it's deployed, send me the function URL
> (`https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`) and the
> secret and I'll finish the RevenueCat dashboard side (URL + Authorization header
> + event types) — that part's ~2 minutes.
>
> Questions for you: **(1)** Option A or B? **(2)** Do you deploy, or should I with
> CLI access? **(3)** Any environment split I should honor (the function tags rows
> `environment = production | sandbox` so you can filter test purchases)?

---

## After deploy — my RevenueCat dashboard steps (mobile agent)
RevenueCat → SafeSpend → Integrations → Webhooks → **Add new configuration**:
- **Webhook URL:** the deployed function URL.
- **Authorization header:** the exact `RC_WEBHOOK_SECRET` value.
- **Environment:** send Production (and Sandbox while testing).
- **Event types:** all subscription lifecycle events (initial purchase, renewal,
  cancellation, uncancellation, expiration, billing issue, product change,
  subscription paused/extended, transfer). The function ignores `TEST` and
  anonymous-id events safely.
- Use the **"Send test event"** button to confirm a 200 and a row lands in
  `revenuecat_entitlements`.

## Notes
- The function is **idempotent + out-of-order safe**: it stores
  `event_timestamp_ms` and ignores any event older than the last one applied.
- `CANCELLATION` keeps `is_active = true` until `expires_at` (auto-renew off, but
  access continues), matching store behavior. `EXPIRATION` flips it off.
- Anonymous RC ids (`$RCAnonymousID:…`) and `TEST` events return 200 without a write.
