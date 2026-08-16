// Supabase Edge Function: revenuecat-webhook
//
// Receives RevenueCat webhook events (Google Play purchases/renewals/trials made
// in the SafeSpend mobile app) and writes server-truth entitlement into the
// `revenuecat_entitlements` table so the WEB app can see mobile purchases too.
//
// Why a dedicated table (not the existing `subscriptions` table): `subscriptions`
// is one row per user and is written by the web app's Paystack flow. Having a
// second writer (this webhook) fight over that row risks clobbering web
// subscriptions. Writing to a separate table keeps the two payment sources
// isolated; the web app reads BOTH and treats a user as Premium if either is
// active. (If the web agent prefers merging into `subscriptions` with a
// `provider` column, only the `TABLE`/upsert target below needs to change.)
//
// DEPLOY (must disable Supabase's JWT check — RevenueCat sends its OWN
// Authorization secret, which we validate ourselves):
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
//   supabase secrets set RC_WEBHOOK_SECRET='<a long random string>'
// Then in RevenueCat → SafeSpend → Integrations → Webhooks → Add configuration:
//   URL:            https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
//   Authorization:  <the same RC_WEBHOOK_SECRET value>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TABLE = 'revenuecat_entitlements';

// RevenueCat event types that (re)grant access.
const ACTIVE_TYPES = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TRANSFER',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

function periodLabel(p?: string) {
  const v = (p || '').toUpperCase();
  if (v === 'TRIAL') return 'trial';
  if (v === 'INTRO') return 'intro';
  return 'normal';
}

function statusFor(type: string, periodType: string, isActive: boolean) {
  if (type === 'EXPIRATION') return 'expired';
  if (type === 'BILLING_ISSUE') return 'billing_issue';
  if (type === 'CANCELLATION') return 'canceled'; // auto-renew off; still active until expiry
  if (!isActive) return 'expired';
  return periodType === 'trial' ? 'trialing' : 'active';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // 1) Auth — RevenueCat sends the exact string configured in the dashboard as
  // the Authorization header. Compare to our shared secret.
  const secret = Deno.env.get('RC_WEBHOOK_SECRET');
  const auth = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!secret || auth !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const event = body?.event;
  if (!event || !event.type) return new Response('No event', { status: 200 });

  // Test pings from the RC dashboard — acknowledge, nothing to store.
  if (event.type === 'TEST') return new Response('ok (test)', { status: 200 });

  const appUserId: string = event.app_user_id || '';
  // Skip anonymous RC ids (a user who never signed in) — not a real Supabase user.
  if (!appUserId || appUserId.startsWith('$RCAnonymousID:')) {
    return new Response('ok (anonymous)', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role — bypasses RLS
  );

  const now = Date.now();
  const expiresMs: number | null = event.expiration_at_ms ?? null;
  const graceMs: number | null = event.grace_period_expiration_ms ?? null;
  const effectiveExpiry = graceMs ?? expiresMs;
  const isActive = event.type !== 'EXPIRATION' && (effectiveExpiry == null || effectiveExpiry > now);
  const periodType = periodLabel(event.period_type);
  const status = statusFor(event.type, periodType, isActive);
  const eventTs: number = event.event_timestamp_ms ?? now;

  // Out-of-order protection: RevenueCat may retry/deliver out of order. Only
  // apply this event if it's newer than what we last stored for the user.
  const { data: existing } = await supabase
    .from(TABLE)
    .select('event_timestamp_ms')
    .eq('user_id', appUserId)
    .maybeSingle();
  if (existing?.event_timestamp_ms != null && eventTs < Number(existing.event_timestamp_ms)) {
    return new Response('ok (stale event ignored)', { status: 200 });
  }

  const row = {
    user_id: appUserId,
    entitlement: (event.entitlement_ids && event.entitlement_ids[0]) || 'premium',
    product_id: event.product_id ?? null,
    status,
    is_active: isActive,
    period_type: periodType,
    store: event.store ?? null,
    environment: event.environment ?? null,
    purchased_at: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
    expires_at: expiresMs ? new Date(expiresMs).toISOString() : null,
    event_type: event.type,
    event_id: event.id ?? null,
    event_timestamp_ms: eventTs,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'user_id' });
  if (error) {
    console.error('[revenuecat-webhook] upsert failed:', error.message);
    // 500 → RevenueCat retries with backoff.
    return new Response('DB error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
