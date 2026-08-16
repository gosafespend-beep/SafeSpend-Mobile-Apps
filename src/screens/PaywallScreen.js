import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, num, glow, alpha } from '../theme/tokens';
import { Button, Icon, Badge } from '../components';
import Confetti from '../components/Confetti';
import { useSubscription } from '../hooks/useSubscription';
import { parsePrice, formatLikePrice, money } from '../lib/format';
import { track } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import { STORE_NAME, STORE_NAME_CAP, STORE_ACCOUNT } from '../lib/revenuecat';

const TERMS_URL = 'https://gosafespend.com/terms-of-service';
const PRIVACY_URL = 'https://gosafespend.com/privacy-policy';
const TRIAL_DAYS = 7;

// Mirror the intent that brought the user here — a blocked action converts on
// "finish what you started", a settings visit converts on the full pitch.
const SOURCE_COPY = {
  add_txn: { title: 'Keep tracking your money', sub: 'Unlock logging so every expense lands in your Safe-to-Spend — starting with the one you were just adding.' },
  scan: { title: 'Scan that receipt', sub: 'Let AI read the amount, merchant and category for you — no typing.' },
  read_only_banner: { title: "Don't lose track now", sub: "Your data is safe, but new spending isn't being tracked. Unlock to pick up right where you left off." },
  onboarding: { title: 'Start with everything on', sub: 'Try every feature free for a week — see your real Safe-to-Spend by tonight.' },
  coach: { title: 'Meet your AI money coach', sub: 'Ask anything about your money and get answers grounded in your real numbers.' },
  mark_paid: { title: 'Log that bill payment', sub: 'Unlock writing so paid bills actually move your balances.' },
  add_recurring: { title: 'Track it automatically', sub: 'Unlock recurring transactions and never re-type a subscription again.' },
  edit: { title: 'Make that change', sub: 'Unlock editing so your records stay accurate.' },
  settings: { title: 'Safe Spend Premium', sub: 'The full toolkit for taking control of your money.' },
};

// Mirrors the goal chosen in the pre-auth welcome, so the post-onboarding paywall
// continues that conversation instead of restarting it.
const INTENT_PITCH = {
  overspend: { title: 'Keep your spending safe', verb: 'stop overspending' },
  save: { title: 'Reach that goal faster', verb: 'save for your goal' },
  debt: { title: 'Clear that debt sooner', verb: 'pay down your debt' },
  track: { title: 'See where it all goes', verb: 'track every last one' },
};

// Benefit-led value props (differentiators first) — not a feature checklist.
const VALUE_PROPS = [
  { icon: 'wallet', text: 'One number that tells you what’s safe to spend today' },
  { icon: 'camera', text: 'Snap receipts & import statements — AI fills everything in' },
  { icon: 'sparkles', text: 'An AI coach that answers questions about your money' },
  { icon: 'barChart', text: 'Forecasts that warn you before you run short' },
  { icon: 'target', text: 'Budgets, goals, debts and bills — all in one place' },
];

const FEATURES = [
  'Unlimited transaction logging', 'AI receipt scan & statement import', 'AI coach, categorization & insights',
  'Cash-flow forecasting & health score', 'Budgets with rollover & auto-budget', 'Goals & debt payoff tracking',
  'Bill reminders & subscriptions', 'Multi-currency accounts',
];

function TimelineRow({ icon, day, text, last, tone }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center', width: 28 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9999, backgroundColor: alpha(tone, 0.16), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14} color={tone} />
        </View>
        {!last ? <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: alpha(tone, 0.25), marginVertical: 2 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
        <Text style={{ fontSize: 12.5, fontFamily: ff.semi, color: c('fg') }}>{day}</Text>
        <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 1, lineHeight: 17 }}>{text}</Text>
      </View>
    </View>
  );
}

export default function PaywallScreen({ source = 'settings', onClose }) {
  const [plan, setPlan] = useState('annual');
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(0); // confetti trigger + success flag
  const {
    isPremium, isTrialing, planType, currentPeriodEnd, prices, trialEligible,
    subscribe, cancel, restore, managedByStore, canPurchase, loading: entLoading,
  } = useSubscription();

  // The 7-day free trial is configured on the ANNUAL plan only — never advertise
  // it on monthly, and never to someone who's already used it.
  // While entitlement/offerings are still loading, assume the store is fine so
  // the CTA doesn't flash "unavailable"; only degrade once we KNOW there's
  // nothing purchasable (missing store key or no offering configured).
  const storeReady = entLoading || canPurchase;

  const trialOnAnnual = trialEligible && !isPremium && storeReady;
  const trialForSelected = trialOnAnnual && plan === 'annual';
  const justPurchased = celebrate > 0;
  const baseCopy = SOURCE_COPY[source] || SOURCE_COPY.settings;

  // When the paywall opens straight off onboarding, speak to what the user just
  // told us and the number they just watched the app work out — a cold generic
  // pitch wastes the one moment they're most invested.
  const [onbCtx, setOnbCtx] = useState(null);
  useEffect(() => {
    if (source !== 'onboarding') return;
    let active = true;
    AsyncStorage.multiGet(['pref_intent', 'pref_onboarding_s2s'])
      .then((pairs) => {
        if (!active) return;
        const map = Object.fromEntries(pairs);
        let s2s = null;
        try { s2s = map.pref_onboarding_s2s ? JSON.parse(map.pref_onboarding_s2s) : null; } catch { /* ignore */ }
        setOnbCtx({ intent: map.pref_intent || null, s2s });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [source]);

  const copy = useMemo(() => {
    if (source !== 'onboarding' || !onbCtx) return baseCopy;
    const goal = INTENT_PITCH[onbCtx.intent];
    const amt = onbCtx.s2s?.amount;
    const hasAmt = typeof amt === 'number' && amt > 0;
    const shown = hasAmt ? money(amt, { currency: onbCtx.s2s.currency || 'USD', cents: false }) : null;
    return {
      title: goal?.title || baseCopy.title,
      sub: hasAmt
        ? `You've got ${shown} safe to spend. Unlock logging and Safe Spend keeps that number honest every day${goal ? ` while you ${goal.verb}` : ''}.`
        : baseCopy.sub,
    };
  }, [source, onbCtx, baseCopy]);

  const annualStr = prices?.annual || '$89.99';
  const monthlyStr = prices?.monthly || '$9.99';

  // Compute the REAL savings % and per-month equivalent from the store's own
  // regional prices — a hardcoded "Save 25%" can be flat wrong in some markets.
  const math = useMemo(() => {
    const a = parsePrice(annualStr);
    const m = parsePrice(monthlyStr);
    if (!a || !m || m.value <= 0) return { perMonth: null, savePct: null, monthlyYear: null };
    const perMonth = formatLikePrice(a.value / 12, a);
    const savePct = Math.round((1 - a.value / (m.value * 12)) * 100);
    const monthlyYear = formatLikePrice(m.value * 12, m);
    return { perMonth, savePct: savePct > 0 && savePct < 90 ? savePct : null, monthlyYear };
  }, [annualStr, monthlyStr]);

  const selectPlan = (id) => { setPlan(id); track('plan_select', { plan: id, source }); };

  const handleSubscribe = async () => {
    track('checkout_start', { plan, source, trial: trialForSelected });
    setBusy(true);
    const res = await subscribe(plan);
    setBusy(false);
    if (res.ok) {
      track('purchase_success', { plan, source });
      haptics.success();
      setCelebrate((n) => n + 1);
    } else if (res.pending) {
      track('purchase_pending', { plan, source });
      Alert.alert('Payment processing', 'Your payment is being confirmed. Premium unlocks automatically as soon as it clears — usually within a few minutes.');
    } else if (res.cancelled) {
      track('purchase_cancel', { plan, source });
    } else {
      track('purchase_fail', { plan, source, error: res.error });
      Alert.alert('Purchase unavailable', res.error || 'Please try again later.');
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    const res = await restore();
    setBusy(false);
    track('restore', { ok: !!res.ok });
    if (res.ok) Alert.alert('Purchases restored', 'Your Premium access is active.');
    else Alert.alert('Nothing to restore', res.error || `No previous purchases were found for this ${STORE_ACCOUNT}.`);
  };

  const handleCancel = () => {
    if (managedByStore) {
      Alert.alert(
        'Manage subscription',
        `Your subscription is billed through ${STORE_NAME}. We'll open your subscription settings where you can cancel or change it — Premium stays active until the end of your current period.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Continue', onPress: () => cancel() },
        ],
      );
      return;
    }
    Alert.alert('Cancel subscription?', 'You keep Premium until the end of your current billing period.', [
      { text: 'Keep Premium', style: 'cancel' },
      {
        text: 'Cancel', style: 'destructive', onPress: async () => {
          setBusy(true);
          const res = await cancel();
          setBusy(false);
          Alert.alert(res.ok ? 'Subscription cancelled' : 'Could not cancel', res.ok ? 'Premium stays active until your period ends.' : (res.error || 'Try again later.'));
        },
      },
    ]);
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (justPurchased) {
    return (
      <View style={{ flex: 1 }}>
        <Confetti trigger={celebrate} />
        <View style={{ padding: 24, paddingTop: 48, alignItems: 'center', gap: 14 }}>
          <View style={[{ width: 76, height: 76, borderRadius: 9999, backgroundColor: c('savings', 0.2), alignItems: 'center', justifyContent: 'center' }, glow(c('savings'), 0.5)]}>
            <Icon name="sparkles" size={34} color={c('savings')} />
          </View>
          <Text style={{ fontSize: 24, fontFamily: ff.bold, color: c('fg'), letterSpacing: -0.36, textAlign: 'center' }}>Welcome to Premium! 🎉</Text>
          <Text style={{ fontSize: 14, color: c('fgMuted'), textAlign: 'center', lineHeight: 21, maxWidth: 300 }}>
            {trialForSelected ? `Your ${TRIAL_DAYS}-day free trial is active — every feature is unlocked. Start logging and watch your Safe-to-Spend come to life.` : 'Every feature is unlocked. Start logging and watch your Safe-to-Spend come to life.'}
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
            <Button block size="lg" icon="check" onPress={() => (onClose ? onClose() : null)}>Start using Premium</Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 16 }}>
      {/* Hero — mirrors the intent that opened the paywall */}
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <View style={[{ width: 64, height: 64, borderRadius: 20, marginBottom: 14, backgroundColor: c('savings', 0.2), alignItems: 'center', justifyContent: 'center' }, glow(c('savings'), 0.4)]}>
          <Icon name="sparkles" size={28} color={c('savings')} />
        </View>
        <Text style={{ fontSize: 24, fontFamily: ff.bold, color: c('fg'), letterSpacing: -0.36, textAlign: 'center' }}>{isPremium ? 'Safe Spend Premium' : copy.title}</Text>
        {isPremium ? (
          <View style={{ marginTop: 10 }}>
            <Badge variant="primary" icon="check">{isTrialing ? 'Free trial active' : `Premium · ${planType || 'active'}`}</Badge>
          </View>
        ) : (
          <Text style={{ fontSize: 14, color: c('fgMuted'), marginTop: 6, textAlign: 'center', lineHeight: 21, maxWidth: 320 }}>{copy.sub}</Text>
        )}
      </View>

      {/* Value props — benefits, not a feature checklist */}
      {!isPremium ? (
        <View style={{ gap: 10, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 14 }}>
          {VALUE_PROPS.map((v) => (
            <View key={v.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c('primary', 0.13), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={v.icon} size={14} color={c('primary')} />
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: c('fg'), lineHeight: 18 }}>{v.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Plan picker — per-month framing; the annual card leads with its monthly equivalent */}
      <View style={{ gap: 10 }}>
        {[
          {
            id: 'annual',
            name: 'Annual',
            big: math.perMonth ? `${math.perMonth}/mo` : `${annualStr}/year`,
            small: math.perMonth ? `Billed ${annualStr} once a year` : null,
            badge: math.savePct ? `Save ${math.savePct}%` : 'Best value',
            chip: trialOnAnnual ? `${TRIAL_DAYS} days free` : null,
          },
          {
            id: 'monthly',
            name: 'Monthly',
            big: `${monthlyStr}/mo`,
            small: math.monthlyYear ? `${math.monthlyYear} over a year` : null,
            badge: null,
            chip: trialOnAnnual ? 'No free trial' : null,
          },
        ].map((p) => {
          const active = plan === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => selectPlan(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${p.name} plan, ${p.big}${p.small ? `, ${p.small}` : ''}`}
              style={{ padding: 16, borderRadius: 14, borderWidth: 2, borderColor: active ? c('primary') : c('border'), backgroundColor: active ? c('primary', 0.06) : c('surface'), overflow: 'hidden' }}
            >
              {active ? <LinearGradient colors={[c('primary', 0.08), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
              {p.badge ? (
                <View style={{ position: 'absolute', top: -1, right: 14, paddingVertical: 3, paddingHorizontal: 10, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: c('savings') }}>
                  <Text style={{ fontSize: 10, fontFamily: ff.bold, letterSpacing: 0.4, textTransform: 'uppercase', color: '#0b1118' }}>{p.badge}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{p.name}</Text>
                    {p.chip ? (
                      <Text style={{ fontSize: 10.5, fontFamily: ff.semi, color: p.id === 'annual' ? c('savings') : c('fgMuted') }}>{p.chip}</Text>
                    ) : null}
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[num(700), { fontSize: 22, color: c('fg'), letterSpacing: -0.33, marginTop: 4 }]}>{p.big}</Text>
                  {p.small ? <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{p.small}</Text> : null}
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 9999, borderWidth: 2, borderColor: active ? c('primary') : c('fgMuted'), backgroundColor: active ? c('primary') : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {active ? <Icon name="check" size={12} color="#fff" stroke={2.5} /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Trial timeline — the anxiety killer */}
      {trialForSelected ? (
        <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 14 }}>
          <TimelineRow icon="lock" tone={c('primary')} day="Today" text="Unlock everything — log, scan, budget, ask the coach. No payment now." />
          <TimelineRow icon="bell" tone={c('warning')} day={`Day ${TRIAL_DAYS - 2}`} text={`${STORE_NAME_CAP} reminds you before the trial ends — cancel in two taps if it's not for you.`} />
          <TimelineRow icon="check" tone={c('income')} day={`Day ${TRIAL_DAYS}`} text={`Trial ends. ${annualStr}/year unless you've cancelled.`} last />
        </View>
      ) : null}

      <View>
        <Button block size="lg" icon="sparkles" onPress={handleSubscribe} disabled={busy || isPremium || !storeReady}>
          {isPremium ? "You're a Premium member"
            : busy ? 'Starting checkout…'
            : !storeReady ? 'Subscriptions unavailable'
            : trialForSelected ? `Start my ${TRIAL_DAYS}-day free trial` : 'Continue'}
        </Button>
        {!isPremium ? (
          <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', marginTop: 8 }}>
            {!storeReady
              // Never advertise a price we can't actually charge — a Buy button
              // that only errors is an App Review rejection (3.1.1).
              ? `Subscriptions aren't available on this device right now. Please try again later.`
              : trialForSelected
                ? `✓ No payment due today · then ${annualStr}/year · Cancel anytime`
                : `${plan === 'annual' ? `${annualStr}/year` : `${monthlyStr}/month`} · Cancel anytime`}
          </Text>
        ) : null}
      </View>

      {!isPremium ? (
        storeReady ? (
          <View style={{ alignItems: 'center', marginTop: -6 }}>
            <Pressable onPress={handleRestore} disabled={busy}><Text style={{ fontSize: 12, color: c('primary'), fontFamily: ff.med }}>Restore purchases</Text></Pressable>
          </View>
        ) : null
      ) : (
        <View style={{ alignItems: 'center', gap: 8, marginTop: -4 }}>
          {currentPeriodEnd ? <Text style={{ fontSize: 11, color: c('fgMuted') }}>{`Renews ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(currentPeriodEnd))}`}</Text> : null}
          <Pressable onPress={handleCancel} disabled={busy}><Text style={{ fontSize: 13, color: c('expense'), fontFamily: ff.med }}>{managedByStore ? 'Manage subscription' : 'Cancel subscription'}</Text></Pressable>
        </View>
      )}

      {/* Full feature list — for the scrollers who want the details */}
      <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6 }}>
        <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg'), paddingVertical: 10 }}>Everything in Premium</Text>
        {FEATURES.map((f, i) => (
          <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c('border', 0.4) }}>
            <Icon name="check" size={14} color={c('income')} stroke={2.5} />
            <Text style={{ flex: 1, fontSize: 13, color: c('fg') }}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={{ alignItems: 'center', paddingBottom: 12 }}>
        <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', lineHeight: 16 }}>{`Billed through ${STORE_NAME}. Auto-renews until you cancel — manage or cancel anytime in your subscription settings. Viewing and exporting your data is always free.`}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)}><Text style={{ fontSize: 11, color: c('primary') }}>Terms</Text></Pressable>
          <Text style={{ fontSize: 11, color: c('fgMuted') }}>·</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}><Text style={{ fontSize: 11, color: c('primary') }}>Privacy</Text></Pressable>
        </View>
      </View>
    </View>
  );
}
