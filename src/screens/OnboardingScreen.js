import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, Image, ScrollView, Linking, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { c, hsl, ff, num, glow, alpha } from '../theme/tokens';
import { Input, Button, Icon, Badge } from '../components';
import { AnimatedNumber, useAnimatedProgress, Reveal as Rise } from '../components/motion';
import { useCelebration } from '../contexts/CelebrationContext';
import { haptics } from '../lib/haptics';
import { SUPPORTED_CURRENCIES, money, currencySymbol } from '../lib/format';
import { useAppLock, BIOMETRIC_LABEL } from '../contexts/AppLockContext';
import { useAuth } from '../contexts/AuthContext';
import { useRegion } from '../contexts/RegionContext';
import { requestNotifPermission, scheduleActivationNudge } from '../lib/notifications';
import { computeAvailableToSpend } from '../lib/available';
import { track } from '../lib/analytics';

// Progress is namespaced per user: a shared/demo device must never restore one
// person's half-finished setup (account choices + typed balances) into another
// person's brand-new account.
const progressKey = (uid) => `onboarding_progress:${uid || 'anon'}`;
const LEGACY_PROGRESS_KEY = 'onboarding_progress';

const logo = require('../../assets/logo-shield.png');

// Steps when the user came through the pre-auth welcome (intro + currency already
// answered there). `Reveal` replaces the old static "Ready" slide: instead of
// telling the user they're set up, it shows the number the app just worked out.
// 'First expense' is last on purpose. The flow used to end on Alerts and hand
// over a dashboard — and 34 of 37 accounts have never recorded a transaction.
// Nobody should arrive having entered nothing. Mirrors the web flow; see
// src/lib/onboardingContract.js.
const STEPS_FROM_WELCOME = ['Account', 'Money', 'Reveal', 'Alerts', 'First expense'];
const STEPS_FULL = ['Welcome', 'Currency', 'Account', 'Money', 'Reveal', 'Alerts', 'First expense'];

// A one-line nod to the goal the user picked in the pre-auth welcome.
const INTENT_LINE = {
  overspend: 'Let’s keep your spending safe.',
  save: 'Let’s reach that goal.',
  debt: 'Let’s knock down that debt.',
  track: 'Let’s see where it all goes.',
};

// The first account has to be somewhere the user actually spends from, because
// Safe-to-Spend is computed from LIQUID balances only. Savings and cards are
// deliberately not offered here — they'd read as 0 spendable (savings) or invert
// the number (a card is debt); both are one tap away from Accounts afterwards.
const PRIMARY_PRESETS = [
  { id: 'bank', name: 'Bank account', type: 'bank', icon: 'wallet', color: '200 70% 50%' },
  { id: 'momo', name: 'Mobile money', type: 'cash', icon: 'smartphone', color: '158 64% 45%', mobileMoneyOnly: true },
  { id: 'cash', name: 'Cash', type: 'cash', icon: 'banknote', color: '45 93% 47%' },
];

/** One-way opt-in row: an icon, copy, and a control that flips to a check once enabled. */
function OfferRow({ icon, tone, title, body, done, onEnable, actionLabel = 'Enable' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: done ? c('income', 0.35) : c('border'), backgroundColor: c('surface') }}>
      <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: alpha(tone, 0.14), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{title}</Text>
        <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2, lineHeight: 15 }}>{body}</Text>
      </View>
      {done ? (
        <View style={{ width: 30, height: 30, borderRadius: 9999, backgroundColor: c('income'), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={15} color="#fff" stroke={2.5} />
        </View>
      ) : (
        <Pressable onPress={onEnable} accessibilityRole="button" style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 9, backgroundColor: c('primary') }, pressed && { opacity: 0.85 }]}>
          <Text style={{ fontSize: 13, fontFamily: ff.semi, color: '#fff' }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** A labelled row in the reveal's breakdown. */
function BreakdownRow({ label, value, tone, sign }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 }}>
      <Text style={{ fontSize: 12.5, color: c('fgMuted') }}>{label}</Text>
      <Text style={[num(600), { fontSize: 13, color: tone || c('fg') }]}>{`${sign || ''}${value}`}</Text>
    </View>
  );
}

const CURRENCIES = SUPPORTED_CURRENCIES;

export default function OnboardingScreen({ onComplete, topInset = 0, initialCurrency, intent, fromWelcome = false }) {
  const insets = useSafeAreaInsets();
  const { celebrate } = useCelebration();
  const { supported: lockSupported, setEnabled: setLockEnabled } = useAppLock();
  const { user } = useAuth();
  const { region } = useRegion();
  const STEPS = fromWelcome ? STEPS_FROM_WELCOME : STEPS_FULL;
  const [step, setStep] = useState(0);
  const [firstAmount, setFirstAmount] = useState('');
  const [firstDescription, setFirstDescription] = useState('');
  const [currency, setCurrency] = useState(initialCurrency || 'USD');
  const [search, setSearch] = useState('');
  // Primary account
  const [preset, setPreset] = useState('bank');
  const [balance, setBalance] = useState('');
  // Monthly money
  const [income, setIncome] = useState('');
  const [payday, setPayday] = useState('');
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDay, setBillDay] = useState('');
  // The bill is optional and starts collapsed so the Money step reads as two quick
  // fields, not a five-field wall right before the payoff. It auto-expands when a
  // resumed session already has bill data (see `showBill` below).
  const [billExpanded, setBillExpanded] = useState(false);
  const [notifsOn, setNotifsOn] = useState(false);
  const [notifBlocked, setNotifBlocked] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [restored, setRestored] = useState(false);
  const finished = useRef(false);

  // Mobile money leads in markets where it's how people actually hold money.
  const presets = useMemo(() => {
    const tags = region?.tags || [];
    const isMomo = tags.includes('m-pesa') || tags.includes('mobile-money');
    const list = PRIMARY_PRESETS.filter((p) => !p.mobileMoneyOnly || isMomo);
    return isMomo ? [...list].sort((a, b) => (a.id === 'momo' ? -1 : b.id === 'momo' ? 1 : 0)) : list;
  }, [region]);

  // Restore an interrupted run so killing the app mid-setup doesn't reset it.
  useEffect(() => {
    let active = true;
    const key = progressKey(user?.id);
    AsyncStorage.getItem(key).then((raw) => {
      if (!active) { return; }
      // One-time cleanup: the old key wasn't user-scoped, so it can't be trusted.
      AsyncStorage.removeItem(LEGACY_PROGRESS_KEY).catch(() => {});
      if (!raw) { setRestored(true); return; }
      try {
        const p = JSON.parse(raw);
        if (typeof p.step === 'number') setStep(Math.min(Math.max(0, p.step), STEPS.length - 1));
        if (p.currency && !initialCurrency) setCurrency(p.currency);
        if (p.preset) setPreset(p.preset);
        if (p.balance != null) setBalance(String(p.balance));
        if (p.income != null) setIncome(String(p.income));
        if (p.payday != null) setPayday(String(p.payday));
        if (p.billName != null) setBillName(String(p.billName));
        if (p.billAmount != null) setBillAmount(String(p.billAmount));
        if (p.billDay != null) setBillDay(String(p.billDay));
      } catch { /* ignore corrupt state */ }
      setRestored(true);
    }).catch(() => setRestored(true));
    return () => { active = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist progress as the user moves through the flow.
  useEffect(() => {
    if (!restored) return;
    AsyncStorage.setItem(progressKey(user?.id), JSON.stringify({
      step, currency, preset, balance, income, payday, billName, billAmount, billDay,
    })).catch(() => {});
  }, [restored, step, currency, preset, balance, income, payday, billName, billAmount, billDay, user?.id]);

  const name = STEPS[step];

  // Funnel telemetry fires when a step is ENTERED (including the first one), so
  // per-step drop-off is measurable. Firing on exit — as this used to — made
  // "viewed and abandoned" indistinguishable from "never reached".
  useEffect(() => {
    if (!restored) return;
    track('onboarding_step', { step: name, index: step });
    /*
     * A light tap when the figure arrives. The app already uses haptics for
     * confirmations elsewhere; the one moment that most deserves it had none.
     * Deliberately NOT success() -- that is reserved for something the user
     * achieved, and a shortfall must not feel like a win.
     */
    if (name === 'Reveal' && reveal.hasInputs) haptics.impact();
  }, [name, restored]); // eslint-disable-line react-hooks/exhaustive-deps

  // A user who walks away mid-setup is the drop-off we most need to see. The
  // current step is read from a ref so this effect can have empty deps — with
  // [step] deps React would run the cleanup on every step change and report an
  // abandon for each one.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => () => {
    if (!finished.current) {
      const i = stepRef.current;
      track('onboarding_abandon', { step: STEPS[i], index: i });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enableNotifs = async () => {
    const { granted, blocked } = await requestNotifPermission();
    setNotifsOn(granted);
    setNotifBlocked(!granted && blocked);
    track('notif_permission', { granted, blocked, where: 'onboarding' });
  };
  const openSettings = () => { Linking.openSettings().catch(() => {}); };
  const enableLock = async () => {
    const ok = await setLockEnabled(true);
    setLockOn(!!ok);
  };

  const progress = ((step + 1) / STEPS.length) * 100;
  // Fills rather than jumping. useAnimatedProgress already honours
  // prefers-reduced-motion internally, so no guard is needed here.
  const progressAnim = useAnimatedProgress(progress);
  const symbol = currencySymbol(currency);
  const filtered = CURRENCIES.filter(
    (x) => !search || x.name.toLowerCase().includes(search.toLowerCase()) || x.code.toLowerCase().includes(search.toLowerCase()) || x.country.toLowerCase().includes(search.toLowerCase())
  );

  const numOr0 = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
  const dayOr = (v, fallback) => {
    const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : fallback;
  };
  const chosen = presets.find((p) => p.id === preset) || presets[0];
  // Show the bill fields once the user opts in, or immediately if a restored run
  // already captured a bill — so resuming never hides data they'd entered.
  const showBill = billExpanded || !!(billName || billAmount || billDay);

  // The next occurrence of a day-of-month, clamped to short months. Used as the
  // recurring income's `next_due` so Safe-to-Spend credits it only when it's
  // genuinely still ahead of the user this month.
  const nextDueFor = (day) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const target = Math.min(day, new Date(y, m + 1, 0).getDate());
    const thisMonth = new Date(y, m, target);
    if (thisMonth > new Date(y, m, now.getDate())) {
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(target).padStart(2, '0')}`;
    }
    const nm = new Date(y, m + 1, 1);
    const t2 = Math.min(day, new Date(nm.getFullYear(), nm.getMonth() + 1, 0).getDate());
    return `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-${String(t2).padStart(2, '0')}`;
  };

  // What the user gets to see before they're ever asked for anything: a real
  // Safe-to-Spend, computed by the same function the dashboard uses, from what
  // they just typed. No network needed — nothing is written until `finish()`.
  const reveal = useMemo(() => {
    const liquid = numOr0(balance);
    const inc = numOr0(income);
    const billAmt = numOr0(billAmount);
    const recurring = inc > 0
      ? [{ type: 'income', amount: inc, is_active: true, next_due: nextDueFor(dayOr(payday, 1)), description: 'Income' }]
      : [];
    const bills = billAmt > 0
      ? [{ id: 'onb-bill', name: billName.trim() || 'Fixed bill', amount: billAmt, due_day: dayOr(billDay, 1), is_active: true }]
      : [];
    const res = computeAvailableToSpend({ liquidBalance: liquid, bills, billStatuses: [], goals: [], recurring, avgDailySpend: 0 });
    return { ...res, hasInputs: liquid > 0 || inc > 0 || billAmt > 0 };
  }, [balance, income, payday, billName, billAmount, billDay]);

  const m = (n) => money(n, { currency, cents: false });

  const finish = () => {
    finished.current = true;
    const bal = numOr0(balance);
    const accounts = [{
      name: chosen.name,
      type: chosen.type,
      color: chosen.color,
      initial_balance: bal,
    }];
    const inc = numOr0(income);
    const recurringIncome = inc > 0
      ? { type: 'income', amount: inc, description: 'Income', category: 'Income', frequency: 'monthly', next_due: nextDueFor(dayOr(payday, 1)) }
      : null;
    const billAmt = numOr0(billAmount);
    const bill = billAmt > 0
      ? { name: billName.trim() || 'Fixed bill', amount: billAmt, due_day: dayOr(billDay, 1) }
      : null;
    const firstAmt = numOr0(firstAmount);
    const firstExpense = firstAmt > 0
      ? { amount: firstAmt, description: firstDescription.trim() || 'First expense' }
      : null;
    if (firstExpense) {
      track('first_transaction', { where: 'onboarding', amount: firstAmt });
      /*
       * The habit the whole product depends on, and onboarding was the one
       * path that reached it without saying anything. RootNavigator already
       * celebrates a first transaction logged through the FAB; this is the
       * same moment arriving by a different door.
       */
      haptics.success();
      celebrate('First transaction logged! 🎉');
    }

    track('onboarding_complete', {
      currency, intent: intent || null, notifsOn, lockOn,
      accountType: chosen.type, hasBalance: bal > 0, hasIncome: !!recurringIncome, hasBill: !!bill,
      safeToSpend: reveal.availableToSpend,
    });
    AsyncStorage.removeItem(progressKey(user?.id)).catch(() => {});
    // Handed to the paywall so its copy can reference a number the user has
    // already seen, instead of opening cold.
    AsyncStorage.setItem('pref_onboarding_s2s', JSON.stringify({
      amount: reveal.availableToSpend, currency, daily: reveal.dailySafe,
    })).catch(() => {});
    scheduleActivationNudge(); // best-effort "come back and finish" reminder
    onComplete && onComplete({ currency, accounts, recurringIncome, bill });
  };

  const skip = () => { finished.current = true; track('onboarding_skip', { step: name }); finish(); };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };

  const canContinue = name !== 'Account' || !!chosen;

  return (
    <View style={{ flex: 1, backgroundColor: c('bg'), paddingTop: topInset + 30, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
      {/* Progress */}
      <View style={{ marginBottom: 22 }}>
        <View style={{ height: 3, backgroundColor: c('surfaceSecondary'), borderRadius: 9999, overflow: 'hidden' }}>
          <Animated.View
            style={{
              width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              height: '100%',
              backgroundColor: c('primary'),
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          {STEPS.map((s, i) => (
            <Text key={s} style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.4, textTransform: 'uppercase', color: i <= step ? c('primary') : c('fgMuted') }}>{s}</Text>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Welcome (only when the pre-auth welcome was skipped) */}
        {name === 'Welcome' ? (
          <View style={{ alignItems: 'center' }}>
            <View style={[{ width: 80, height: 80, marginBottom: 18, borderRadius: 20, overflow: 'hidden' }, glow(c('primary'), 0.5)]}>
              <Image source={logo} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
            <Text style={{ fontSize: 24, fontFamily: ff.bold, letterSpacing: -0.36, color: c('fg') }}>Welcome to Safe Spend</Text>
            <Text style={{ fontSize: 14, color: c('fgMuted'), marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 300 }}>Your personal finance tracker. Let's get you set up in just a few steps.</Text>
            <View style={{ marginTop: 24, padding: 16, backgroundColor: c('surfaceSecondary'), borderRadius: 12, gap: 10, alignSelf: 'stretch' }}>
              {['Track income and expenses', 'Set budgets and goals', 'Get spending insights', 'Your data, securely stored'].map((t) => (
                <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 9999, backgroundColor: c('income', 0.2), alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={12} color={c('income')} stroke={2.5} />
                  </View>
                  <Text style={{ fontSize: 13, color: c('fg') }}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Currency (only when the pre-auth welcome was skipped) */}
        {name === 'Currency' ? (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 10, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="wallet" size={20} color={c('primary')} />
              </View>
              <Text style={{ fontSize: 18, fontFamily: ff.semi, color: c('fg') }}>Choose your currency</Text>
              <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 4 }}>Select the currency you use most</Text>
            </View>
            <Input leading="search" placeholder="Search currencies…" value={search} onChange={setSearch} />
            <View style={{ marginTop: 12, gap: 8 }}>
              {filtered.map((cur) => {
                const active = currency === cur.code;
                return (
                  <Pressable key={cur.code} onPress={() => setCurrency(cur.code)} style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 11, borderWidth: 2, borderColor: active ? c('primary') : c('border'), backgroundColor: active ? c('primary', 0.08) : c('surface'), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <Text style={[num(600), { fontSize: 18, width: 28, textAlign: 'center', color: c('fg') }]}>{cur.symbol}</Text>
                      <View>
                        <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('fg') }}>{`${cur.country} — ${cur.code}`}</Text>
                        <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{cur.name}</Text>
                      </View>
                    </View>
                    {active ? (
                      <View style={{ width: 20, height: 20, borderRadius: 9999, backgroundColor: c('primary'), alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="check" size={12} color="#fff" stroke={2.5} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Primary account — one liquid account, correctly typed */}
        {name === 'Account' ? (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 10, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="wallet" size={20} color={c('primary')} />
              </View>
              <Text style={{ fontSize: 20, fontFamily: ff.bold, letterSpacing: -0.3, color: c('fg') }}>Where's your money?</Text>
              <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 4, textAlign: 'center' }}>Start with the account you spend from most.</Text>
            </View>
            <View style={{ gap: 10 }}>
              {presets.map((p) => {
                const active = preset === p.id;
                return (
                  <Pressable key={p.id} onPress={() => setPreset(p.id)} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: active ? c('primary') : c('border'), backgroundColor: active ? c('primary', 0.06) : c('surface') }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: hsl(p.color, 0.2), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={p.icon} size={18} color={hsl(p.color)} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{p.name}</Text>
                    <View style={{ width: 22, height: 22, borderRadius: 9999, borderWidth: 2, borderColor: active ? c('primary') : c('fgMuted'), backgroundColor: active ? c('primary') : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {active ? <Icon name="check" size={12} color="#fff" stroke={2.5} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>How much is in it now?</Text>
              <Input prefix={symbol} placeholder="0.00" keyboardType="decimal-pad" value={balance} onChange={setBalance} />
            </View>
            <Text style={{ fontSize: 11, color: c('fgMuted'), lineHeight: 16, marginTop: 10 }}>
              You can add savings, cards and other accounts anytime from Accounts.
            </Text>
          </View>
        ) : null}

        {/* Monthly money — income is the focused ask; the bill is an optional add-on */}
        {name === 'Money' ? (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 10, backgroundColor: c('income', 0.18), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="banknote" size={20} color={c('income')} />
              </View>
              <Text style={{ fontSize: 20, fontFamily: ff.bold, letterSpacing: -0.3, color: c('fg') }}>Money in, money out</Text>
              <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 4, textAlign: 'center' }}>Start with your income — that's all we need to work out what's safe to spend.</Text>
            </View>

            <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>Monthly income</Text>
            <Input prefix={symbol} placeholder="0.00" keyboardType="decimal-pad" value={income} onChange={setIncome} />
            <View style={{ marginTop: 10 }}>
              <Input label="Paid on which day of the month?" placeholder="e.g. 28" keyboardType="number-pad" value={payday} onChange={setPayday} />
            </View>

            {showBill ? (
              <>
                <View style={{ height: 1, backgroundColor: c('border'), marginVertical: 18 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted') }}>Your biggest fixed bill</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted') }}>Optional</Text>
                </View>
                <Input placeholder="e.g. Rent" value={billName} onChange={setBillName} />
                <View style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1.3 }}>
                    <Input prefix={symbol} placeholder="0.00" keyboardType="decimal-pad" value={billAmount} onChange={setBillAmount} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input placeholder="Due day" keyboardType="number-pad" value={billDay} onChange={setBillDay} />
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: c('fgMuted'), lineHeight: 16, marginTop: 10 }}>
                  We'll track this as a recurring bill and remind you before it's due.
                </Text>
              </>
            ) : (
              <Pressable
                onPress={() => setBillExpanded(true)}
                accessibilityRole="button"
                accessibilityLabel="Add your biggest fixed bill, optional"
                style={({ pressed }) => [{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c('border'), backgroundColor: c('surface') }, pressed && { opacity: 0.85 }]}
              >
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c('primary', 0.14), alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={16} color={c('primary')} stroke={2.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>Add your biggest fixed bill</Text>
                  <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2, lineHeight: 15 }}>Rent, a loan… we'll remind you before it's due · optional</Text>
                </View>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* Reveal — the payoff. A number the app worked out, not one they typed. */}
        {name === 'Reveal' ? (
          <View>
            {reveal.hasInputs ? (
              <>
                <View style={{ alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: c('fgMuted') }}>Here's where you stand</Text>
                </View>
                <View style={{ borderRadius: 16, backgroundColor: c('surface'), borderWidth: 1, borderColor: alpha(c('primary'), 0.4), padding: 18, marginTop: 10, overflow: 'hidden' }}>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: c('primary') }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>Safe to Spend</Text>
                    <Badge variant={reveal.status === 'danger' ? 'expense' : reveal.status === 'caution' ? 'warning' : 'income'}>
                      {reveal.status === 'danger' ? 'Shortfall' : reveal.status === 'caution' ? 'Caution' : 'Healthy'}
                    </Badge>
                  </View>
                  {/*
                      * Counts up rather than appearing. This is the moment the
                      * whole flow builds to, and a number that lands instantly
                      * reads as a receipt. duration.slow with easing.decelerate
                      * is what AnimatedNumber already uses -- the easing the
                      * theme annotates as "things arriving (count-ups, fills)".
                      */}
                    <AnimatedNumber
                      value={reveal.availableToSpend}
                      format={m}
                      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                      maxFontSizeMultiplier={1.3}
                      style={[num(700), { fontSize: 38, letterSpacing: -0.5, color: c('primary') }]}
                    />
                  {reveal.dailySafe > 0 ? (
                    <Text maxFontSizeMultiplier={1.3} style={[num(500), { fontSize: 13, color: c('primary'), marginTop: 4 }]}>
                      {`≈ ${m(reveal.dailySafe)}/day for the next ${reveal.daysRemaining} day${reveal.daysRemaining === 1 ? '' : 's'}`}
                    </Text>
                  ) : null}
                  <View style={{ marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: c('border', 0.6) }}>
                    <BreakdownRow label="In your account" value={m(reveal.liquidBalance)} />
                    {reveal.expectedIncomeThisMonth > 0 ? (
                      <BreakdownRow label="Income still to come" value={m(reveal.expectedIncomeThisMonth)} tone={c('income')} sign="+" />
                    ) : null}
                    {reveal.unpaidBillsThisMonth > 0 ? (
                      <BreakdownRow label="Bills still to pay" value={m(reveal.unpaidBillsThisMonth)} tone={c('expense')} sign="−" />
                    ) : null}
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: c('fgMuted'), lineHeight: 18, marginTop: 14, textAlign: 'center' }}>
                  This updates itself as you log spending. {intent && INTENT_LINE[intent] ? INTENT_LINE[intent] : ''}
                </Text>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingTop: 20 }}>
                <View style={[{ width: 72, height: 72, borderRadius: 9999, marginBottom: 18, backgroundColor: c('income', 0.2), alignItems: 'center', justifyContent: 'center' }, glow(c('income'), 0.4)]}>
                  <Icon name="sparkles" size={32} color={c('income')} />
                </View>
                <Text style={{ fontSize: 24, fontFamily: ff.bold, letterSpacing: -0.36, color: c('fg') }}>You're all set!</Text>
                {intent && INTENT_LINE[intent] ? (
                  <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('primary'), marginTop: 6, textAlign: 'center' }}>{INTENT_LINE[intent]}</Text>
                ) : null}
                <Text style={{ fontSize: 14, color: c('fgMuted'), marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 300 }}>
                  Add a balance and your income whenever you're ready and Safe to Spend will come to life.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Finishing touches: notification priming + biometric offer */}
        {name === 'Alerts' ? (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 10, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={20} color={c('primary')} />
              </View>
              <Text style={{ fontSize: 18, fontFamily: ff.semi, color: c('fg') }}>A few finishing touches</Text>
              <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 4, textAlign: 'center' }}>Optional — you can change these anytime.</Text>
            </View>
            <View style={{ gap: 10 }}>
              <OfferRow
                icon="bell"
                tone={c('primary')}
                title="Bill reminders & budget alerts"
                body={notifBlocked ? 'Notifications are turned off for SafeSpend. Re-enable them in Settings.' : 'Get a heads-up before a bill is due or you go over budget.'}
                done={notifsOn}
                actionLabel={notifBlocked ? 'Open settings' : 'Enable'}
                onEnable={notifBlocked ? openSettings : enableNotifs}
              />
              {lockSupported ? (
                <OfferRow
                  icon="shield"
                  tone={hsl('200 70% 50%')}
                  title="Lock with biometrics"
                  body={`Require your ${BIOMETRIC_LABEL} to open SafeSpend.`}
                  done={lockOn}
                  onEnable={enableLock}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

        {/* First expense — one real entry, so the dashboard is never empty */}
      {name === 'First expense' ? (
        <View style={{ gap: 14 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 10, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="receipt" size={20} color={c('primary')} />
            </View>
            <Text style={{ fontSize: 20, fontFamily: ff.bold, letterSpacing: -0.3, color: c('fg') }}>Log one thing you spent</Text>
            <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 4, textAlign: 'center' }}>
              Anything at all — a coffee will do. This is the habit the whole app runs on.
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>Amount</Text>
            <Input prefix={symbol} placeholder="0.00" keyboardType="decimal-pad" value={firstAmount} onChange={setFirstAmount} />
          </View>
          <Input label="What was it?" placeholder="e.g. Coffee" value={firstDescription} onChange={setFirstDescription} />
          <Text style={{ fontSize: 11, color: c('fgMuted'), lineHeight: 16, textAlign: 'center' }}>
            You can skip this, but people who log something on day one are the ones who keep going.
          </Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button block size="lg" variant="outline" onPress={() => setStep(step - 1)}>Back</Button></View> : null}
        <View style={{ flex: step > 0 ? 1.4 : 1 }}>
          <Button block size="lg" icon={step === STEPS.length - 1 ? 'sparkles' : undefined} onPress={next} disabled={!canContinue}>
            {step === STEPS.length - 1 ? (numOr0(firstAmount) > 0 ? 'Save and finish' : 'Skip for now') : name === 'Reveal' ? 'Continue' : name === 'Money' ? 'See my number' : 'Continue'}
          </Button>
        </View>
      </View>
      {step === 0 ? (
        <Pressable onPress={skip} style={{ marginTop: 8, padding: 8, alignItems: 'center' }}>
          <Text style={{ color: c('fgMuted'), fontSize: 12 }}>Skip setup, I'll configure later</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
