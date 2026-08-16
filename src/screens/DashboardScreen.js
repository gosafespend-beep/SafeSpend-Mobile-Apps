import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { c, hsl, ff, num, alpha } from '../theme/tokens';
import { StatCard, Card, ListRow, ProgressBar, Donut, Badge, Icon, Button } from '../components';
import { AnimatedNumber, Reveal } from '../components/motion';
import { PeriodSelector } from '../components/PeriodSelector';
import { InsightsCard } from '../components/InsightsCard';
import { generateInsights } from '../lib/insights';
import { money, moneyCompact } from '../lib/format';
import { useDashboardData } from '../hooks/useDashboardData';
import { ErrorState } from '../components/ErrorState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import { useCelebration } from '../contexts/CelebrationContext';
import { useProfileInfo } from '../hooks/useProfileInfo';

// Checklist framing tuned to the goal picked in the pre-auth welcome.
const INTENT_CHECKLIST = {
  overspend: { title: 'Set up to stop overspending', order: ['account', 'txn', 'budget'] },
  save: { title: 'Set up to reach your goal', order: ['account', 'txn', 'budget'] },
  debt: { title: 'Set up to pay off debt', order: ['account', 'budget', 'txn'] },
  track: { title: 'Get set up', order: ['account', 'txn', 'budget'] },
};

function shortDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

/** Read-only wall banner — the app is view-only until the user subscribes. */
function ReadOnlyBanner({ trialEligible, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c('savings', 0.4), backgroundColor: c('savings', 0.08) }, pressed && { opacity: 0.9 }]}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c('savings', 0.18), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sparkles" size={17} color={c('savings')} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>{trialEligible ? 'Start your free trial' : 'Subscribe to keep going'}</Text>
        <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{trialEligible ? 'Unlock logging and every feature free for 7 days.' : 'Your account is read-only — subscribe to log again.'}</Text>
      </View>
      <Button size="sm" onPress={onPress}>{trialEligible ? 'Try free' : 'Subscribe'}</Button>
    </Pressable>
  );
}

/** Entry to the AI money coach — a contextual, always-available invitation. */
function AskCoachCard({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ask your AI money coach"
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c('primary', 0.3), backgroundColor: c('primary', 0.07) }, pressed && { opacity: 0.9 }]}
    >
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c('primary', 0.16), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sparkles" size={18} color={c('primary')} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: ff.semi, color: c('fg') }}>Ask your money coach</Text>
        <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>“Can I afford it?” · “Where did my money go?”</Text>
      </View>
      <Icon name="chevronRight" size={16} color={c('primary')} />
    </Pressable>
  );
}

/** Non-blocking nudge to verify a new account's email — dismissible, not a wall. */
function VerifyEmailBanner({ onResend, onDismiss }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c('warning', 0.4), backgroundColor: c('warning', 0.08) }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c('warning', 0.18), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="mail" size={17} color={c('warning')} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>Verify your email</Text>
        <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>Secure your account and unlock password recovery.</Text>
      </View>
      <Button size="sm" variant="secondary" onPress={onResend}>Resend</Button>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss email verification reminder">
        <Icon name="x" size={16} color={c('fgMuted')} />
      </Pressable>
    </View>
  );
}

/** First-run activation funnel — self-checks and disappears once set up. */
function ActivationChecklist({ steps, onDismiss, title = 'Get set up' }) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <View style={{ borderRadius: 14, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('primary', 0.25), padding: 16, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: c('primary') }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={16} color={c('primary')} />
          </View>
          <View>
            <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{title}</Text>
            <Text style={{ fontSize: 11, color: c('fgMuted') }}>{`${doneCount} of ${steps.length} done`}</Text>
          </View>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss setup checklist">
          <Icon name="x" size={16} color={c('fgMuted')} />
        </Pressable>
      </View>
      <View style={{ gap: 8 }}>
        {steps.map((s) => (
          <Pressable
            key={s.label}
            onPress={s.done ? undefined : s.onPress}
            disabled={s.done}
            accessibilityRole="button"
            accessibilityLabel={s.label}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: s.done ? 'transparent' : c('surfaceSecondary') }, pressed && !s.done && { backgroundColor: c('surfaceHover') }]}
          >
            <View style={{ width: 22, height: 22, borderRadius: 9999, borderWidth: 2, borderColor: s.done ? c('income') : c('fgMuted'), backgroundColor: s.done ? c('income') : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {s.done ? <Icon name="check" size={12} color="#fff" stroke={2.5} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontFamily: ff.med, color: s.done ? c('fgMuted') : c('fg'), textDecorationLine: s.done ? 'line-through' : 'none' }}>{s.label}</Text>
            {!s.done ? <Icon name="chevronRight" size={16} color={c('fgMuted')} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function DashboardScreen({ onOpenTxn, onGoTab, onAdd }) {
  const { data, loading, error, reload } = useDashboardData();
  const { settings } = useSettings();
  const { isEmailVerified, resendVerification } = useAuth();
  const { canWrite, trialEligible, presentPaywall, loading: entLoading } = useEntitlement();
  const { celebrate } = useCelebration();
  const { name } = useProfileInfo();
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [emailDismissed, setEmailDismissed] = useState(false);
  const [intent, setIntent] = useState(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const cur = settings.currency;
  const m = (n, opts = {}) => money(n, { ...opts, currency: cur });
  const mc = (n) => moneyCompact(n, cur);
  const go = (route) => onGoTab && onGoTab(route);

  // Dismiss state is persisted so these nudges don't reappear on every launch.
  useEffect(() => {
    AsyncStorage.multiGet(['pref_checklist_dismissed', 'pref_email_banner_dismissed', 'pref_intent'])
      .then((pairs) => {
        const map = Object.fromEntries(pairs);
        if (map.pref_checklist_dismissed === 'true') setChecklistDismissed(true);
        if (map.pref_email_banner_dismissed === 'true') setEmailDismissed(true);
        if (map.pref_intent) setIntent(map.pref_intent);
      })
      .catch(() => {})
      .finally(() => setPrefsLoaded(true));
  }, []);

  // A quiet, earned milestone: the first time net worth turns positive (and the
  // user has some activity), celebrate climbing into the green — once, ever.
  useEffect(() => {
    if (!data) return;
    const hasActivity = data.txns?.length > 0 || data.totalIncome > 0 || data.totalExpenses > 0;
    if (data.balance > 0 && hasActivity) {
      AsyncStorage.getItem('pref_nw_positive').then((seen) => {
        if (seen == null) { celebrate("You're in the green! 🌱"); AsyncStorage.setItem('pref_nw_positive', 'true').catch(() => {}); }
      }).catch(() => {});
    }
  }, [data?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissChecklist = () => { setChecklistDismissed(true); AsyncStorage.setItem('pref_checklist_dismissed', 'true').catch(() => {}); };
  const dismissEmail = () => { setEmailDismissed(true); AsyncStorage.setItem('pref_email_banner_dismissed', 'true').catch(() => {}); };
  const resendEmail = async () => {
    const { error: e } = await resendVerification();
    Alert.alert(e ? 'Could not send' : 'Email sent', e ? e.message : 'Check your inbox for the verification link.');
  };

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { balance, accountCount, totalIncome, totalExpenses, net, categories, totalBudget, txns, available, multiCurrency } = data;
  const approx = multiCurrency ? '≈ ' : ''; // totals converted from mixed currencies
  const insights = generateInsights(data);
  const totalSpent = categories.reduce((s, x) => s + x.total, 0);
  const segments = totalSpent > 0 ? categories.map((x) => ({ color: x.color, share: x.total / totalSpent })) : [];
  const savingsRate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;
  const budgetUse = totalBudget > 0 ? Math.round((totalExpenses / totalBudget) * 100) : 0;

  const hasTxns = txns.length > 0 || totalIncome > 0 || totalExpenses > 0;
  // Show until every foundational step is done (the old extra clause made the
  // "Set a budget" step unreachable as a trigger).
  const showChecklist = prefsLoaded && !checklistDismissed && (accountCount === 0 || !hasTxns || totalBudget === 0);
  const checklistCfg = INTENT_CHECKLIST[intent] || INTENT_CHECKLIST.track;
  const stepById = {
    account: { label: 'Add an account', done: accountCount > 0, onPress: () => go('accounts') },
    txn: { label: 'Log your first transaction', done: hasTxns, onPress: () => onAdd && onAdd() },
    budget: { label: 'Set a budget', done: totalBudget > 0, onPress: () => go('budget') },
  };
  const steps = checklistCfg.order.map((k) => stepById[k]);
  const showEmailBanner = prefsLoaded && !isEmailVerified && !emailDismissed;

  const tone = available.status === 'danger' ? c('expense') : available.status === 'caution' ? c('warning') : c('primary');
  const badgeVariant = available.status === 'danger' ? 'expense' : available.status === 'caution' ? 'warning' : 'income';
  const badgeLabel = available.status === 'danger' ? 'Shortfall' : available.status === 'caution' ? 'Caution' : 'Healthy';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greetEmoji = hour < 12 ? '☀️' : hour < 18 ? '👋' : '🌙';
  const firstName = (name || '').trim().split(' ')[0];

  return (
    <Reveal y={6} style={{ padding: 14, paddingBottom: 28, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -2 }}>
        <Text style={{ fontSize: 17, fontFamily: ff.bold, color: c('fg'), letterSpacing: -0.2 }} numberOfLines={1}>
          {`${greeting}${firstName ? `, ${firstName}` : ''}`}
        </Text>
        <Text style={{ fontSize: 17 }}>{greetEmoji}</Text>
      </View>
      <PeriodSelector />

      {!entLoading && !canWrite ? <ReadOnlyBanner trialEligible={trialEligible} onPress={() => presentPaywall('read_only_banner')} /> : null}

      {showEmailBanner ? <VerifyEmailBanner onResend={resendEmail} onDismiss={dismissEmail} /> : null}

      {showChecklist ? <ActivationChecklist steps={steps} title={checklistCfg.title} onDismiss={dismissChecklist} /> : null}

      {/* Safe to Spend hero — the number people open the app for, so it leads. */}
      <View style={{ borderRadius: 14, backgroundColor: c('surface'), borderWidth: 1, borderColor: alpha(tone, 0.4), padding: 16, overflow: 'hidden' }}>
        <LinearGradient colors={[alpha(tone, 0.12), alpha(tone, 0.04), 'transparent']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: tone }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: alpha(tone, 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="wallet" size={17} color={tone} />
            </View>
            <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>Safe to Spend</Text>
          </View>
          <Badge variant={badgeVariant} icon={available.status === 'safe' ? 'check' : undefined}>{badgeLabel}</Badge>
        </View>
        <AnimatedNumber value={available.availableToSpend} format={(n) => `${approx}${m(n)}`} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[num(700), { fontSize: 34, letterSpacing: -0.4, color: tone }]} />
        {available.dailySafe > 0 ? (
          <Text maxFontSizeMultiplier={1.3} style={[num(500), { fontSize: 12, color: tone, marginTop: 4 }]}>{`${approx}${mc(available.dailySafe)}/day for ${available.daysRemaining} day${available.daysRemaining === 1 ? '' : 's'}`}</Text>
        ) : null}
        <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{multiCurrency ? `${available.statusMessage} · converted to ${cur}` : available.statusMessage}</Text>
        <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c('border', 0.5) }}>
          {[
            { lbl: 'Available now', v: mc(available.liquidBalance), col: c('fg') },
            { lbl: 'Bills due', v: mc(available.unpaidBillsThisMonth), col: c('expense') },
            { lbl: 'Expected in', v: mc(available.expectedIncomeThisMonth), col: c('income') },
            { lbl: 'Goal saving', v: mc(available.goalContributions), col: c('fgMuted') },
          ].map((x) => (
            <View key={x.lbl} style={{ flex: 1, alignItems: 'center' }}>
              <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={{ fontSize: 10, color: c('fgMuted'), marginBottom: 2, textAlign: 'center' }}>{x.lbl}</Text>
              <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[num(600), { fontSize: 11, color: x.col }]}>{x.v}</Text>
            </View>
          ))}
        </View>
      </View>

      <AskCoachCard onPress={() => go('coach')} />

      {/* Stat grid — every number is a door. */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard label="Accounts" variant="balance" amount={balance} format={(n) => `${approx}${mc(n)}`} subtitle={`${accountCount} account${accountCount === 1 ? '' : 's'}`} onPress={() => go('accounts')} />
          <StatCard label="Income" variant="income" amount={totalIncome} format={(n) => `${approx}${mc(n)}`} subtitle={totalIncome > 0 ? `${savingsRate}% saved` : 'this month'} onPress={() => go('reports')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard label="Expenses" variant="expense" amount={totalExpenses} format={(n) => `${approx}${mc(n)}`} subtitle={totalBudget > 0 ? `${budgetUse}% of budget` : 'this month'} onPress={() => go('reports')} />
          <StatCard label="Net" variant="default" amount={net} format={(n) => `${approx}${mc(n)}`} subtitle={net >= 0 ? 'saved' : 'overspent'} onPress={() => go('log')} />
        </View>
      </View>

      <InsightsCard insights={insights} />

      {/* Spending by category */}
      {categories.length > 0 ? (
        <Card title="Spending by Category" action={<Pressable hitSlop={8} onPress={() => go('reports')}><Icon name="chevronRight" size={16} color={c('fgMuted')} /></Pressable>}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingTop: 6 }}>
            <Donut
              segments={segments}
              size={120}
              center={
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, fontFamily: ff.semi, letterSpacing: 0.7, textTransform: 'uppercase', color: c('fgMuted') }}>Total</Text>
                  <Text style={[num(700), { fontSize: 15, color: c('fg') }]}>{mc(totalSpent)}</Text>
                </View>
              }
            />
            <View style={{ flex: 1, gap: 8 }}>
              {categories.slice(0, 5).map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: hsl(s.color) }} />
                  <Text style={{ flex: 1, fontSize: 12, color: c('fg') }} numberOfLines={1}>{s.name}</Text>
                  <Text style={[num(600), { fontSize: 12, color: c('fg') }]}>{mc(s.total)}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      ) : null}

      {/* Budget status */}
      {categories.some((cat) => cat.budget > 0) ? (
        <Card title="Budget Status" action={<Text style={[num(400), { fontSize: 11, color: c('fgMuted') }]}>{mc(totalExpenses)} / {mc(totalBudget)}</Text>}>
          <View style={{ gap: 10, marginTop: 4 }}>
            {categories.filter((cat) => cat.budget > 0).slice(0, 4).map((cat) => {
              const pct = Math.min(100, (cat.total / cat.budget) * 100);
              const over = cat.total > cat.budget;
              const barColor = over ? c('expense') : pct > 80 ? c('warning') : hsl(cat.color);
              return (
                <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: hsl(cat.color) }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: c('fg') }}>{cat.name}</Text>
                      <Text style={[num(600), { fontSize: 11, color: over ? c('expense') : c('fgMuted') }]}>{Math.round(pct)}%</Text>
                    </View>
                    <ProgressBar value={pct} color={barColor} height={5} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {/* Recent */}
      <Card title="Recent" padded={false} action={<Pressable hitSlop={8} onPress={() => go('log')}><Text style={{ fontSize: 12, color: c('primary'), fontFamily: ff.med }}>See all</Text></Pressable>}>
        {txns.length > 0 ? (
          <View style={{ borderTopWidth: 1, borderTopColor: c('border', 0.5), marginTop: 4 }}>
            {txns.map((t, i) => (
              <Reveal key={t.id} delay={i * 40}>
                <ListRow
                  icon={t.icon}
                  iconColor={t.type === 'income' ? c('income') : c('expense')}
                  title={t.label}
                  subtitle={`${shortDate(t.date)} · ${t.cat}`}
                  right={`${t.type === 'income' ? '+' : '-'}${moneyCompact(t.amount, t.currency || cur)}`}
                  accent={t.type}
                  onPress={() => onOpenTxn && onOpenTxn(t)}
                  last={i === txns.length - 1}
                />
              </Reveal>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 13, color: c('fgMuted'), paddingVertical: 16, textAlign: 'center' }}>
            No transactions yet this month. Tap + to add one.
          </Text>
        )}
      </Card>
    </Reveal>
  );
}
