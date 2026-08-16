-- Server-truth mirror of RevenueCat / Google Play entitlements written by the
-- `revenuecat-webhook` edge function. Kept separate from the Paystack-owned
-- `subscriptions` table so the two payment sources never overwrite each other.
-- The web app reads this to reflect mobile purchases; a user is Premium if an
-- active row exists here OR in `subscriptions`.

create table if not exists public.revenuecat_entitlements (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  entitlement         text not null default 'premium',
  product_id          text,
  status              text not null,          -- active | trialing | canceled | expired | billing_issue
  is_active           boolean not null default false,
  period_type         text,                   -- trial | intro | normal
  store               text,                   -- play_store | app_store
  environment         text,                   -- production | sandbox
  purchased_at        timestamptz,
  expires_at          timestamptz,
  event_type          text,
  event_id            text,
  event_timestamp_ms  bigint,                 -- for out-of-order protection
  updated_at          timestamptz not null default now()
);

create index if not exists revenuecat_entitlements_active_idx
  on public.revenuecat_entitlements (is_active);

alter table public.revenuecat_entitlements enable row level security;

-- Users may read their own entitlement (optional convenience; the mobile app
-- reads RevenueCat directly on-device, so this is mainly for the web app / debug).
drop policy if exists "read own rc entitlement" on public.revenuecat_entitlements;
create policy "read own rc entitlement"
  on public.revenuecat_entitlements
  for select
  using (auth.uid() = user_id);

-- No client INSERT/UPDATE/DELETE policies: only the edge function writes, using
-- the service-role key (which bypasses RLS).
