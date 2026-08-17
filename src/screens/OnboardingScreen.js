import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Linking, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, ff, num, alpha } from '../theme/tokens';
import { Input, Button, Icon, Badge } from '../components';
import { AnimatedNumber, useAnimatedProgress, Reveal as Rise } from '../components/motion';
import { AmountField, DayField, ChoiceField, MultiField, ForkField } from '../components/OnboardingFields';
import { SUPPORTED_CURRENCIES, money, currencySymbol } from '../lib/format';
import { useAppLock } from '../contexts/AppLockContext';
import { useCelebration } from '../contexts/CelebrationContext';
import { useAuth } from '../contexts/AuthContext';
import { requestNotifPermission, scheduleActivationNudge } from '../lib/notifications';
import { computeAvailableToSpend } from '../lib/available';
import { haptics } from '../lib/haptics';
import { track } from '../lib/analytics';
import {
  stepsFor, ACCOUNT_OPTIONS, FREQUENCY_OPTIONS, OVERSPEND_CATEGORIES,
  reflect, reflectDay, BUILDING_LINES,
} from '../lib/onboardingSteps';

/**
 * Onboarding, rendered from the sequence in lib/onboardingSteps.js.
 *
 * Replaces a seven-step screen whose steps were a conditional chain and whose
 * Money step asked five things at once. Twenty screens, one question each.
 * Finance is the longest onboarding category in the industry and seven of the
 * ten longest apps are finance apps, so this is the norm for the category
 * rather than an indulgence.
 *
 * The web app renders the same ids in the same order. `alerts` is the one
 * mobile-only screen and it sits after the reveal, because asking for
 * notification permission before the user has anything to be notified about is
 * the weakest moment to ask.
 */

const DEFAULT_GOAL_MONTHS = 6;

export default function OnboardingScreen({ onComplete, topInset = 0, initialCurrency, intents = [], fromWelcome = false }) {
  const insets = useSafeAreaInsets();
  const { celebrate } = useCelebration();
  const { supported: lockSupported, setEnabled: setLockEnabled } = useAppLock();
  const { user } = useAuth();

  const [index, setIndex] = useState(0);
  const [currency, setCurrency] = useState(initialCurrency || 'USD');
  const [accountType, setAccountType] = useState(null);
  const [balance, setBalance] = useState('');
  const [income, setIncome] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [payday, setPayday] = useState(null);
  const [hasBill, setHasBill] = useState(null);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDay, setBillDay] = useState(null);
  const [overspend, setOverspend] = useState([]);
  const [savingFor, setSavingFor] = useState(null);
  const [goalTarget, setGoalTarget] = useState('');
  const [hasDebt, setHasDebt] = useState(null);
  const [debtAmount, setDebtAmount] = useState('');
  const [notifsOn, setNotifsOn] = useState(null);
  const [firstAmount, setFirstAmount] = useState('');
  const [firstWhat, setFirstWhat] = useState('');
  const [buildLine, setBuildLine] = useState(0);

  const numOr0 = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const symbol = currencySymbol(currency);
  const m = (n) => money(n, { currency, cents: false });

  const forks = useMemo(
    () => ({ 'has-bill': hasBill === true, 'saving-for': savingFor === true, 'has-debt': hasDebt === true }),
    [hasBill, savingFor, hasDebt],
  );
  const steps = useMemo(() => stepsFor(fromWelcome, forks), [fromWelcome, forks]);
  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  const progress = ((index + 1) / steps.length) * 100;
  const progressAnim = useAnimatedProgress(progress);

  /**
   * Everything entered so far, as the figure it produces.
   *
   * Savings and credit contribute nothing to the opening balance, matching the
   * liquid-balance rule everywhere else: money set aside is not money that is
   * safe to spend, and the reveal must not disagree with the dashboard the user
   * lands on thirty seconds later.
   */
  const reveal = useMemo(() => {
    const liquid = accountType === 'savings' || accountType === 'credit' ? 0 : numOr0(balance);
    const inc = numOr0(income);
    const bill = numOr0(billAmount);
    const res = computeAvailableToSpend({
      liquidBalance: liquid,
      bills: bill > 0 ? [{ id: 'onb', name: billName.trim() || 'Fixed bill', amount: bill, due_day: billDay || 1, is_active: true }] : [],
      billStatuses: [],
      goals: numOr0(goalTarget) > 0 ? [{ target_amount: numOr0(goalTarget), current_amount: 0, deadline: null }] : [],
      recurring: inc > 0 ? [{ type: 'income', amount: inc, is_active: true, next_due: nextDue(payday || 1), description: 'Income' }] : [],
      avgDailySpend: 0,
    });
    return { ...res, hasInputs: liquid > 0 || inc > 0 || bill > 0 };
  }, [accountType, balance, income, payday, billName, billAmount, billDay, goalTarget]);

  /* ---------------------------------------------------------- telemetry -- */

  useEffect(() => {
    if (!step) return;
    track('onboarding_step', { step: step.id, index });
    // A light tap when the figure arrives. Deliberately impact(), not success():
    // success is for something achieved, and a shortfall must not feel like one.
    if (step.id === 'reveal' && reveal.hasInputs) haptics.impact();
  }, [step && step.id, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const finished = useRef(false);
  const stepRef = useRef(step && step.id);
  stepRef.current = step && step.id;
  useEffect(() => () => {
    // Read from a ref with empty deps, or one walk-away is reported twenty times.
    if (!finished.current) track('onboarding_abandon', { step: stepRef.current, index: 0 });
  }, []);

  /* ------------------------------------------------------------ compute -- */

  useEffect(() => {
    if (!step || step.kind !== 'compute') return;
    setBuildLine(0);
    const timers = BUILDING_LINES.map((_, i) => setTimeout(() => setBuildLine(i), i * 550));
    const done = setTimeout(() => setIndex((i) => i + 1), BUILDING_LINES.length * 550 + 300);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [step && step.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- nav -- */

  const canContinue = (() => {
    if (!step) return false;
    switch (step.id) {
      case 'currency': return Boolean(currency);
      case 'account-type': return Boolean(accountType);
      case 'income': return numOr0(income) > 0;
      case 'pay-frequency': return Boolean(frequency);
      case 'payday': return payday !== null;
      case 'has-bill': return hasBill !== null;
      case 'bill-amount': return numOr0(billAmount) > 0;
      case 'bill-day': return billDay !== null;
      case 'saving-for': return savingFor !== null;
      case 'has-debt': return hasDebt !== null;
      case 'alerts': return notifsOn !== null;
      // Balance, names and the first expense stay skippable: blocking on them
      // trades a completed setup for a perfect one.
      default: return true;
    }
  })();

  const finish = () => {
    finished.current = true;
    const type = accountType || 'bank';
    const preset = ACCOUNT_OPTIONS.find((o) => o.id === type);
    const inc = numOr0(income);
    const bill = numOr0(billAmount);
    const first = numOr0(firstAmount);

    if (first > 0) {
      track('first_transaction', { where: 'onboarding', amount: first });
      haptics.success();
      celebrate('First transaction logged! 🎉');
    }

    track('onboarding_complete', {
      currency, intents: intents.join(','), accountType: type,
      hasBalance: numOr0(balance) > 0, hasIncome: inc > 0, hasBill: bill > 0,
      categories: overspend.length, hasGoal: numOr0(goalTarget) > 0,
      hasDebt: numOr0(debtAmount) > 0, firstExpense: first > 0,
      notifsOn: notifsOn === true, safeToSpend: reveal.availableToSpend,
      screens: steps.length,
    });

    if (notifsOn !== true) scheduleActivationNudge();

    onComplete({
      currency,
      accounts: [{
        name: (preset && preset.label.replace(/^A /, '')) || 'Account',
        type,
        color: preset ? `hsl(${preset.tone})` : c('primary'),
        initial_balance: numOr0(balance),
      }],
      recurringIncome: inc > 0
        ? { type: 'income', amount: inc, description: 'Income', category: 'Income', frequency, next_due: nextDue(payday || 1) }
        : null,
      bill: bill > 0 ? { name: billName.trim() || 'Fixed bill', amount: bill, due_day: billDay || 1 } : null,
      categories: overspend,
      goal: numOr0(goalTarget) > 0 ? { name: 'Savings goal', target: numOr0(goalTarget), months: DEFAULT_GOAL_MONTHS } : null,
      debt: numOr0(debtAmount) > 0 ? { name: 'Debt', amount: numOr0(debtAmount) } : null,
      firstExpense: first > 0 ? { amount: first, description: firstWhat.trim() || 'First expense' } : null,
    });
  };

  const next = () => { if (isLast) finish(); else setIndex((i) => i + 1); };

  const skip = () => {
    finished.current = true;
    track('onboarding_skip', { step: step && step.id });
    onComplete({ currency, accounts: [], recurringIncome: null, bill: null, categories: [], goal: null, debt: null, firstExpense: null });
  };

  const enableNotifs = async () => {
    const { granted, blocked } = await requestNotifPermission();
    setNotifsOn(granted);
    track('notif_permission', { granted, blocked, where: 'onboarding' });
    if (!granted && blocked) Linking.openSettings().catch(() => {});
    if (lockSupported && granted) setLockEnabled(true);
  };

  /* --------------------------------------------------------------- body -- */

  const body = () => {
    if (!step) return null;
    switch (step.id) {
      case 'intro':
        return (
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center', lineHeight: 19 }}>
            Nothing you enter leaves your account, and we never ask for a bank login.
          </Text>
        );

      case 'currency':
        return (
          <ChoiceField
            value={currency}
            onChange={setCurrency}
            options={SUPPORTED_CURRENCIES.slice(0, 6).map((cur) => ({
              id: cur.code, label: `${cur.symbol}  ${cur.code}`, hint: cur.country || cur.name,
            }))}
          />
        );

      case 'account-type':
        return <ChoiceField options={ACCOUNT_OPTIONS} value={accountType} onChange={setAccountType} />;

      case 'balance':
        return <AmountField autoFocus value={balance} onChange={setBalance} symbol={symbol}
          reflection={reflect('balance', { value: numOr0(balance), money: m })} />;

      case 'income':
        return <AmountField autoFocus value={income} onChange={setIncome} symbol={symbol}
          reflection={reflect('income', { value: numOr0(income), money: m })} />;

      case 'pay-frequency':
        return <ChoiceField options={FREQUENCY_OPTIONS} value={frequency} onChange={setFrequency} />;

      case 'payday':
        return <DayField value={payday} onChange={setPayday} reflection={reflectDay(payday)} />;

      case 'has-bill':
        return <ForkField value={hasBill} onChange={setHasBill} yesLabel="Yes, I do" noLabel="Not really" />;

      case 'bill-name':
        return <Input autoFocus placeholder="Rent, car loan, childcare…" value={billName} onChange={setBillName} />;

      case 'bill-amount':
        return <AmountField autoFocus value={billAmount} onChange={setBillAmount} symbol={symbol}
          reflection={reflect('bill-amount', { value: numOr0(billAmount), income: numOr0(income), money: m })} />;

      case 'bill-day':
        return <DayField value={billDay} onChange={setBillDay} reflection={reflectDay(billDay)} />;

      case 'overspend':
        return (
          <MultiField
            options={OVERSPEND_CATEGORIES}
            values={overspend}
            onToggle={(id) => setOverspend((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
            reflection={reflect('overspend', { count: overspend.length, money: m })}
          />
        );

      case 'saving-for':
        return <ForkField value={savingFor} onChange={setSavingFor} yesLabel="Yes" noLabel="Not yet" />;

      case 'goal-detail':
        return <AmountField autoFocus value={goalTarget} onChange={setGoalTarget} symbol={symbol}
          reflection={reflect('goal-detail', { value: numOr0(goalTarget), money: m })} />;

      case 'has-debt':
        return <ForkField value={hasDebt} onChange={setHasDebt} yesLabel="Yes" noLabel="Nothing right now" />;

      case 'debt-detail':
        return <AmountField autoFocus value={debtAmount} onChange={setDebtAmount} symbol={symbol}
          reflection={reflect('debt-detail', { value: numOr0(debtAmount), money: m })} />;

      case 'building':
        return (
          <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}
            style={{ fontSize: 14, color: c('fgMuted'), textAlign: 'center' }}>
            {BUILDING_LINES[buildLine]}
          </Text>
        );

      case 'reveal':
        return reveal.hasInputs ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            {/* Counts up rather than appearing. A number that lands instantly
                reads as a receipt. */}
            <AnimatedNumber
              value={reveal.availableToSpend}
              format={m}
              numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
              maxFontSizeMultiplier={1.3}
              style={[num(700), { fontSize: 40, letterSpacing: -0.6, color: c('primary') }]}
            />
            <Badge variant={reveal.status === 'danger' ? 'expense' : reveal.status === 'caution' ? 'warning' : 'income'}>
              {reveal.status === 'danger' ? 'Shortfall' : reveal.status === 'caution' ? 'Caution' : 'Healthy'}
            </Badge>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center' }}>
              {reveal.statusMessage}
            </Text>
            <View style={{ alignSelf: 'stretch', gap: 8, backgroundColor: c('surfaceSecondary'), borderRadius: 13, padding: 15, marginTop: 4 }}>
              <Row label="Starting balance" value={m(reveal.liquidBalance)} />
              {reveal.expectedIncomeThisMonth > 0 ? <Row label="Income still due" value={`+${m(reveal.expectedIncomeThisMonth)}`} tone={c('income')} /> : null}
              {reveal.unpaidBillsThisMonth > 0 ? <Row label="Bills to pay" value={`−${m(reveal.unpaidBillsThisMonth)}`} tone={c('expense')} /> : null}
              {reveal.goalContributions > 0 ? <Row label="Set aside for your goal" value={`−${m(reveal.goalContributions)}`} /> : null}
              <Row label="That’s about" value={`${m(reveal.dailySafe)}/day · ${reveal.daysRemaining}d`} />
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Icon name="sparkles" size={28} color={c('income')} />
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, color: c('fgMuted'), textAlign: 'center', lineHeight: 20 }}>
              Add your income whenever you’re ready and we’ll work out what’s safe to spend.
            </Text>
          </View>
        );

      case 'alerts':
        return (
          <View style={{ gap: 12 }}>
            <ForkField
              value={notifsOn}
              onChange={(v) => { setNotifsOn(v); if (v) enableNotifs(); }}
              yesLabel="Yes, remind me"
              noLabel="No thanks"
            />
            {/* Teasing the actual notification is what turns a permission
                request into an offer. */}
            <View style={{ backgroundColor: c('surfaceSecondary'), borderRadius: 12, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name="bell" size={16} color={c('fgMuted')} />
              <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, fontSize: 12, color: c('fgMuted'), lineHeight: 17 }}>
                “Rent is due in 3 days — you’ve got enough set aside.”
              </Text>
            </View>
          </View>
        );

      case 'first-amount':
        return <AmountField autoFocus value={firstAmount} onChange={setFirstAmount} symbol={symbol} />;

      case 'first-what':
        return <Input autoFocus placeholder="Coffee, bus fare, lunch…" value={firstWhat} onChange={setFirstWhat} />;

      default:
        return null;
    }
  };

  if (!step) return null;

  return (
    <View style={{ flex: 1, backgroundColor: c('bg'), paddingTop: topInset + 30, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
      <View style={{ marginBottom: 22 }}>
        <View style={{ height: 3, backgroundColor: c('surfaceSecondary'), borderRadius: 9999, overflow: 'hidden' }}>
          <Animated.View style={{
            width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            height: '100%',
            backgroundColor: c('primary'),
          }} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
        <Rise key={step.id} y={8}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 21, fontFamily: ff.bold, letterSpacing: -0.4, color: c('fg'), textAlign: 'center' }}>
              {step.title}
            </Text>
            {step.subtitle ? (
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                {step.subtitle}
              </Text>
            ) : null}
          </View>
          {body()}
        </Rise>
      </ScrollView>

      {/* The compute step advances itself; a button would invite a tap racing
          the timer. */}
      {step.kind !== 'compute' ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {index > 0 ? (
            <View style={{ flex: 1 }}>
              <Button block size="lg" variant="outline" onPress={() => setIndex((i) => i - 1)}>Back</Button>
            </View>
          ) : null}
          <View style={{ flex: index > 0 ? 1.4 : 1 }}>
            <Button block size="lg" onPress={next} disabled={!canContinue}
              icon={isLast ? 'sparkles' : undefined}>
              {isLast
                ? (numOr0(firstAmount) > 0 ? 'Save and finish' : 'Skip for now')
                : step.id === 'income' ? 'See what that means'
                : 'Continue'}
            </Button>
          </View>
        </View>
      ) : null}

      {index === 0 ? (
        <Pressable onPress={skip} style={{ marginTop: 8, padding: 8, alignItems: 'center' }}>
          <Text style={{ color: c('fgMuted'), fontSize: 12 }}>Skip setup, I’ll configure later</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({ label, value, tone }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted') }}>{label}</Text>
      <Text maxFontSizeMultiplier={1.3} style={[num(600), { fontSize: 13, color: tone || c('fg') }]}>{value}</Text>
    </View>
  );
}

/** Next occurrence of a day-of-month, as YYYY-MM-DD, clamped to month length. */
function nextDue(day) {
  const now = new Date();
  const d = Math.min(Math.max(1, Math.floor(day) || 1), 31);
  let year = now.getFullYear();
  let month = now.getMonth();
  if (d <= now.getDate()) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  const clamped = Math.min(d, new Date(year, month + 1, 0).getDate());
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}
