import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Linking, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, ff, num, alpha } from '../theme/tokens';
import { Button, Icon, Badge } from '../components';
import { AnimatedNumber, useAnimatedProgress, Reveal as Rise } from '../components/motion';
import { AmountField, DayField, ChoiceField, MultiField, ForkField, NameField } from '../components/OnboardingFields';
import OnboardingScene from '../components/OnboardingScene';
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
  reflect, reflectDay, BUILDING_LINES, CHAPTERS,
  BILL_SUGGESTIONS, FIRST_EXPENSE_SUGGESTIONS,
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

  /*
   * Progress within the current chapter, not across the whole flow.
   *
   * The bar has one segment per chapter, so what it needs is how far through
   * this act you are — measured against the steps sharing this chapter in the
   * PRUNED sequence, so a fork that removes three screens shortens the segment
   * rather than stalling it.
   */
  const chapterSteps = step ? steps.filter((s) => s.chapter === step.chapter) : [];
  const posInChapter = step ? chapterSteps.findIndex((s) => s.id === step.id) : 0;
  const progress = ((posInChapter + 1) / Math.max(1, chapterSteps.length)) * 100;
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
      // A deadline, not null: computeAvailableToSpend skips any goal without
      // one, so passing null made the reveal reserve nothing while the
      // dashboard — seconds later — reserved target/6. On a 3,000 goal that is
      // a 500 drop between the last onboarding screen and the first real one,
      // which reads as the product having lied about the number it just spent
      // twenty screens computing.
      goals: numOr0(goalTarget) > 0
        ? [{ target_amount: numOr0(goalTarget), current_amount: 0, deadline: goalDeadline(DEFAULT_GOAL_MONTHS) }]
        : [],
      recurring: inc > 0 ? [{ type: 'income', amount: inc, is_active: true, next_due: nextDue(payday || 1), description: 'Income' }] : [],
      avgDailySpend: 0,
    });
    return { ...res, hasInputs: liquid > 0 || inc > 0 || bill > 0 };
  }, [accountType, balance, income, payday, billName, billAmount, billDay, goalTarget]);

  /**
   * The floating values over the illustration.
   *
   * The detail that separates the reference flows from a form: what you just
   * typed, shown back on the picture. Capped at two — three is a dashboard —
   * and the running figure is suppressed when it would repeat the chip above
   * it, which happens on the balance screen before any income is entered.
   */
  const chips = useMemo(() => {
    const out = [];
    if (!step) return out;
    const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

    if (step.id === 'balance' && numOr0(balance) > 0) {
      out.push({ label: 'In the account', value: m(numOr0(balance)), tone: c('primary') });
    }
    if ((step.id === 'income' || step.id === 'pay-frequency') && numOr0(income) > 0) {
      out.push({ label: 'Each month', value: `+${m(numOr0(income))}`, tone: c('income') });
    }
    if (step.id === 'payday' && payday) {
      out.push({ label: 'Payday', value: `${payday}${ordinal(payday)}`, tone: c('income') });
    }
    if (step.id.indexOf('bill-') === 0 && numOr0(billAmount) > 0) {
      out.push({ label: billName.trim() || 'Bill', value: `−${m(numOr0(billAmount))}`, tone: c('expense') });
    }
    if (step.id === 'goal-detail' && numOr0(goalTarget) > 0) {
      out.push({ label: 'Per month', value: m(numOr0(goalTarget) / DEFAULT_GOAL_MONTHS), tone: c('savings') });
    }
    if (step.id === 'debt-detail' && numOr0(debtAmount) > 0) {
      out.push({ label: 'Left to pay', value: m(numOr0(debtAmount)), tone: c('expense') });
    }
    const running = m(reveal.availableToSpend);
    if (reveal.hasInputs && step.id !== 'reveal' && step.kind !== 'compute'
        && out.length < 2 && !out.some((x) => x.value === running)) {
      out.push({ label: 'Safe to spend', value: running, tone: c('primary') });
    }
    return out;
  }, [step && step.id, balance, income, payday, billName, billAmount, goalTarget, debtAmount, reveal]); // eslint-disable-line react-hooks/exhaustive-deps

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
          // Left-aligned, in a panel. Centring one paragraph inside a
          // left-aligned card gives the screen two competing axes.
          <View style={{ backgroundColor: alpha(c('surfaceSecondary'), 0.6), borderRadius: 12, borderWidth: 1, borderColor: c('border'), padding: 14 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), lineHeight: 19 }}>
              Nothing you enter leaves your account, and we never ask for a bank login.
            </Text>
          </View>
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
        return <NameField autoFocus value={billName} onChange={setBillName}
          placeholder="Rent" suggestions={BILL_SUGGESTIONS} />;

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
        return <NameField autoFocus value={firstWhat} onChange={setFirstWhat}
          placeholder="Coffee" suggestions={FIRST_EXPENSE_SUGGESTIONS} />;

      default:
        return null;
    }
  };

  if (!step) return null;

  const sceneVariant = reveal.status === 'danger' ? 'steady' : reveal.status === 'caution' ? 'caution' : 'safe';

  return (
    <View style={{ flex: 1, backgroundColor: c('bg'), paddingTop: topInset + 14, paddingBottom: insets.bottom + 16 }}>
      {/* Progress, chapter and Skip ride above the picture, as on web. */}
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            {CHAPTERS.map((name, i) => (
              <View key={name} style={{ flex: 1, height: 3, borderRadius: 9999, backgroundColor: c('surfaceSecondary'), overflow: 'hidden' }}>
                {i < step.chapter ? (
                  <View style={{ width: '100%', height: '100%', backgroundColor: c('primary') }} />
                ) : i === step.chapter ? (
                  <Animated.View style={{
                    width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                    height: '100%',
                    backgroundColor: c('primary'),
                  }} />
                ) : null}
              </View>
            ))}
          </View>
          {/* Persistent, not first-screen-only: someone looking for a way out
              at screen fourteen looks here, not at the bottom of screen one.
              Padded to a 44pt target rather than sized to its text. */}
          {step.kind !== 'compute' ? (
            <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip setup"
              hitSlop={12} style={{ paddingVertical: 12, paddingHorizontal: 4 }}>
              <Text style={{ color: c('fgMuted'), fontSize: 13 }}>Skip</Text>
            </Pressable>
          ) : null}
        </View>
        <Text maxFontSizeMultiplier={1.2} style={{
          marginTop: 8, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
          fontFamily: ff.semi, color: alpha(c('primary'), 0.75),
        }}>
          {CHAPTERS[step.chapter]}
        </Text>
      </View>

      {/*
        The picture, and the values it carries.

        This is the half of the screen the old layout did not have: it opened
        straight onto a heading and a control, which is a form with a progress
        bar on top. Height is fixed so the mascot does not change size between
        screens — the renders came back at differing aspects.
      */}
      <View style={{ height: 186, justifyContent: 'center', marginTop: 6 }}>
        <OnboardingScene stepId={step.id} variant={sceneVariant} height={172} />
        {chips.slice(0, 2).map((chip, i) => (
          <View
            key={chip.label}
            style={{
              position: 'absolute',
              left: i === 0 ? 16 : undefined,
              right: i === 0 ? undefined : 16,
              top: i === 0 ? 14 : undefined,
              bottom: i === 0 ? undefined : 14,
              flexDirection: 'row', alignItems: 'center', gap: 9,
              backgroundColor: c('surface'), borderRadius: 12, borderWidth: 1, borderColor: c('border'),
              paddingHorizontal: 11, paddingVertical: 8,
            }}
          >
            <View style={{ width: 3, height: 22, borderRadius: 999, backgroundColor: chip.tone }} />
            <View>
              <Text maxFontSizeMultiplier={1.1} style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>
                {chip.label}
              </Text>
              <Text maxFontSizeMultiplier={1.1} style={[num(600), { fontSize: 13, color: chip.tone, marginTop: 2 }]}>
                {chip.value}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 20 }}>
        <Rise key={step.id} y={8}>
          <View style={{ marginBottom: 20 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 24, fontFamily: ff.bold, letterSpacing: -0.5, color: c('fg') }}>
              {step.title}
            </Text>
            {step.subtitle ? (
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), marginTop: 7, lineHeight: 19 }}>
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
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 14, marginTop: 4, paddingHorizontal: 20,
          // Hairline over the button band, as on web: it marks where the
          // scrolling content ends rather than letting the last row look cut off.
          borderTopWidth: 1, borderTopColor: alpha(c('border'), 0.6) }}>
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
      {/* The first-screen-only skip link is gone: Skip is now a persistent
          header control, where someone who wants out on screen fourteen will
          actually look for it. */}
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

/** The deadline a goal seeded here will actually be written with. */
function goalDeadline(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
