import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { c, ff, num, alpha } from '../theme/tokens';
import { Card, ProgressBar, Donut, Sparkline, Icon, RingProgress } from '../components';
import { GroupedBars, LineChart, HBars, ChartGhost } from '../components/charts';
import { Reveal } from '../components/motion';
import { money } from '../lib/format';
import { useAnalytics } from '../hooks/useAnalytics';
import { computeHealthScore } from '../lib/healthScore';
import { ErrorState } from '../components/ErrorState';
import { ScreenSkeleton } from '../components/Skeleton';
import CategoryDrilldownSheet from '../sheets/CategoryDrilldownSheet';
import { useSettings } from '../contexts/SettingsContext';

const RANGES = [
  { id: 'month', label: 'Month' },
  { id: '6mo', label: '6 mo' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
];

// category → graphs. Graph ids drive renderGraph().
const CATS = [
  { id: 'cashflow', label: 'Cash flow', icon: 'arrowUpDown', color: 'income', graphs: [['cf_inout', 'Income vs expenses'], ['cf_net', 'Net cash flow'], ['cf_rate', 'Savings rate'], ['cf_cumulative', 'Cumulative savings']] },
  { id: 'spending', label: 'Spending', icon: 'shopping', color: 'warning', graphs: [['sp_donut', 'Spending by category'], ['sp_top', 'Top categories'], ['sp_trend', 'Spending trend'], ['sp_merchants', 'Top merchants'], ['sp_budget', 'Budget vs actual'], ['sp_weekday', 'By weekday']] },
  { id: 'income', label: 'Income', icon: 'wallet', color: 'income', graphs: [['in_source', 'Income by source'], ['in_trend', 'Income trend'], ['in_streams', 'Income streams']] },
  { id: 'networth', label: 'Net worth', icon: 'trendingUp', color: 'primary', graphs: [['nw_trend', 'Net worth trend'], ['nw_al', 'Assets vs liabilities'], ['nw_accounts', 'Balance by account']] },
  { id: 'debt', label: 'Debt', icon: 'creditCard', color: 'expense', graphs: [['dt_bars', 'Balances'], ['dt_progress', 'Payoff progress'], ['dt_payoff', 'Projected payoff']] },
  { id: 'goals', label: 'Goals', icon: 'target', color: 'primary', graphs: [['gl_progress', 'Goal progress'], ['gl_contrib', 'Contributions'], ['gl_total', 'Saved vs target']] },
  { id: 'needswants', label: 'Needs vs wants', icon: 'scale', color: 'primary', graphs: [['nw_split', 'Needs vs wants'], ['nw_trend2', 'Needs / wants trend'], ['nw_rule', '50 / 30 / 20 rule']] },
  { id: 'forecast', label: 'Forecast', icon: 'barChart', color: 'fgMuted', graphs: [['fc_balance', 'Projected balance'], ['fc_runrate', 'Monthly run-rate'], ['fc_bills', 'Upcoming bills']] },
];

function Empty({ text = 'Not enough data yet.' }) {
  return <ChartGhost message={text} />;
}

/**
 * A report card with a share button: captures itself (chart + subtle branding
 * line) as a PNG and opens the system share sheet. Numbers people are proud of
 * become posts — the cheapest growth loop a finance app has.
 */
function ShareCard({ title, children }) {
  const shotRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Share “${title}”` });
      }
    } catch { /* capture failed or user cancelled — nothing to clean up */ }
    setSharing(false);
  };
  return (
    <View ref={shotRef} collapsable={false} style={{ backgroundColor: c('bg') }}>
      <Card
        title={title}
        action={
          <Pressable onPress={share} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Share ${title}`} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Icon name="share" size={15} color={c('fgMuted')} />
          </Pressable>
        }
      >
        <View style={{ marginTop: 6 }}>{children}</View>
        <Text style={{ fontSize: 9, color: c('fgMuted'), textAlign: 'right', marginTop: 10, opacity: 0.8 }}>SafeSpend · gosafespend.com</Text>
      </Card>
    </View>
  );
}
function Legend({ color, label }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: color }} /><Text style={{ fontSize: 10, color: c('fgMuted') }}>{label}</Text></View>;
}

export default function ReportsScreen() {
  const { settings } = useSettings();
  const [range, setRange] = useState('6mo');
  const [openCat, setOpenCat] = useState(null);
  const [drill, setDrill] = useState(null);
  const { data, error, reload } = useAnalytics(range);

  // Persist the selected range so Reports reopens where the user left it.
  useEffect(() => {
    AsyncStorage.getItem('pref_reports_range').then((v) => { if (v) setRange(v); }).catch(() => {});
  }, []);
  const changeRange = (r) => { setRange(r); AsyncStorage.setItem('pref_reports_range', r).catch(() => {}); };
  const m = (n) => money(n, { currency: settings.currency });
  const m0 = (n) => money(n, { currency: settings.currency, cents: false });

  // In a category detail, the hardware back returns to the hub (not Home).
  useEffect(() => {
    if (!openCat) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpenCat(null); return true; });
    return () => sub.remove();
  }, [openCat]);

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const CurrencyNote = data.multiCurrency ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c('surfaceSecondary') }}>
      <Icon name="sparkles" size={13} color={c('fgMuted')} />
      <Text style={{ flex: 1, fontSize: 11, color: c('fgMuted') }}>{`Amounts converted to ${data.displayCurrency} at today's rates.`}</Text>
    </View>
  ) : null;

  const RangeChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {RANGES.map((r) => {
        const active = range === r.id;
        return (
          <Pressable key={r.id} onPress={() => changeRange(r.id)} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ paddingVertical: 7, paddingHorizontal: 16, borderRadius: 9999, backgroundColor: active ? c('primary') : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? 'transparent' : c('border') }}>
            <Text style={{ fontSize: 12, fontFamily: ff.med, color: active ? '#fff' : c('fg') }}>{r.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // ── tiny per-tile preview ───────────────────────────────────
  const TilePreview = ({ id }) => {
    const line = (arr, col) => <Sparkline color={col} data={(arr || []).map((x) => x.value)} height={22} />;
    if (id === 'cashflow') return line(data.cumulative, c('income'));
    if (id === 'income') return line(data.monthly.map((x) => ({ value: x.income })), c('income'));
    if (id === 'networth') return line(data.nwTrend, c('primary'));
    if (id === 'debt') return line(data.debtPayoff, c('expense'));
    if (id === 'forecast') return line(data.forecast.series, c('fgMuted'));
    if (id === 'spending') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 22 }}>
          {data.monthly.map((mm, i) => {
            const max = Math.max(1, ...data.monthly.map((x) => x.expense));
            return <View key={i} style={{ flex: 1, height: `${Math.max(6, (mm.expense / max) * 100)}%`, backgroundColor: c('warning', 0.5), borderRadius: 2 }} />;
          })}
        </View>
      );
    }
    if (id === 'goals') {
      const pct = data.goalTarget > 0 ? (data.goalSaved / data.goalTarget) * 100 : 0;
      return <View style={{ height: 6, borderRadius: 3, backgroundColor: c('primary', 0.2), marginTop: 8 }}><View style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 3, backgroundColor: c('primary') }} /></View>;
    }
    // needswants
    const t = data.needs + data.wants || 1;
    return (
      <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
        <View style={{ width: `${(data.needs / t) * 100}%`, backgroundColor: c('primary') }} />
        <View style={{ width: `${(data.wants / t) * 100}%`, backgroundColor: c('warning') }} />
      </View>
    );
  };

  // ── individual graph renderer ───────────────────────────────
  const renderGraph = ([id, title]) => {
    let body = null;
    if (id === 'cf_inout') body = data.monthly.some((x) => x.income || x.expense)
      ? <GroupedBars data={data.monthly} /> : <Empty />;
    else if (id === 'cf_net') body = <LineChart data={data.monthly.map((x) => ({ label: x.label, value: x.net }))} color={c('primary')} format={m0} />;
    else if (id === 'cf_rate') body = <LineChart data={data.monthly.map((x) => ({ label: x.label, value: x.savingsRate }))} color={c('income')} format={(v) => `${Math.round(v)}%`} />;
    else if (id === 'cf_cumulative') body = <LineChart data={data.cumulative} color={c('income')} format={m0} />;
    else if (id === 'sp_donut') body = data.donut.length
      ? (<View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingTop: 6 }}>
          <Donut segments={data.donut} size={116} center={<View style={{ alignItems: 'center' }}><Text style={{ fontSize: 9, color: c('fgMuted') }}>Total</Text><Text style={[num(700), { fontSize: 14, color: c('fg') }]}>{m0(data.totalExpense)}</Text></View>} />
          <View style={{ flex: 1, gap: 7 }}>{data.categories.slice(0, 5).map((s) => (<View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: s.color }} /><Text style={{ flex: 1, fontSize: 12, color: c('fg') }} numberOfLines={1}>{s.name}</Text><Text style={[num(600), { fontSize: 12, color: c('fg') }]}>{m0(s.value)}</Text></View>))}</View>
        </View>) : <Empty text="No spending in this range." />;
    else if (id === 'sp_top') body = data.categories.length
      ? <HBars data={data.categories.slice(0, 10).map((x) => ({ label: x.name, value: x.value, color: x.color }))} format={m0} onPress={(d) => setDrill(d.label)} /> : <Empty />;
    else if (id === 'sp_trend') body = <LineChart data={data.monthly.map((x) => ({ label: x.label, value: x.expense }))} color={c('expense')} format={m0} />;
    else if (id === 'sp_merchants') body = data.merchants.length
      ? <HBars data={data.merchants.map((x) => ({ label: x.label, value: x.value, color: c('warning') }))} format={m0} /> : <Empty />;
    else if (id === 'sp_budget') body = data.budgetVsActual.length
      ? (<View style={{ gap: 12 }}>{data.budgetVsActual.map((b) => (<View key={b.label} style={{ gap: 4 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 12, color: c('fg') }}>{b.label}</Text><Text style={[num(600), { fontSize: 11, color: b.actual > b.limit ? c('expense') : c('fgMuted') }]}>{m0(b.actual)} / {m0(b.limit)}</Text></View><ProgressBar value={b.pct} color={b.color} height={6} /></View>))}</View>)
      : <Empty text="Set some budgets to compare." />;
    else if (id === 'sp_weekday') body = <HBars data={data.weekday.map((x) => ({ label: x.label, value: x.value, color: c('warning') }))} format={m0} />;
    else if (id === 'in_source') body = data.incomeBySource.length
      ? <HBars data={data.incomeBySource.map((x) => ({ label: x.label, value: x.value, color: c('income') }))} format={m0} /> : <Empty text="No income in this range." />;
    else if (id === 'in_trend') body = <LineChart data={data.monthly.map((x) => ({ label: x.label, value: x.income }))} color={c('income')} format={m0} />;
    else if (id === 'in_streams') body = (<View style={{ gap: 6 }}><StatRow label="Income streams" value={String(data.incomeStreams)} /><StatRow label="Total income" value={m0(data.totalIncome)} color={c('income')} /></View>);
    else if (id === 'nw_trend') body = (
      <View>
        <LineChart data={data.nwTrend} color={c('primary')} format={m0} />
        <Text style={{ fontSize: 10, color: c('fgMuted'), textAlign: 'center', marginTop: 6 }}>Estimated from your monthly net cash flow.</Text>
      </View>
    );
    else if (id === 'nw_al') body = <HBars data={[{ label: 'Assets', value: data.totalAssets, color: c('income') }, { label: 'Liabilities', value: data.totalLiabilities, color: c('expense') }]} format={m0} />;
    else if (id === 'nw_accounts') body = data.accountsList.length ? <HBars data={data.accountsList} format={m0} /> : <Empty />;
    else if (id === 'dt_bars') body = data.debts.length
      ? <HBars data={data.debts.map((d) => ({ label: d.name, value: d.current, color: c('expense') }))} format={m0} /> : <Empty text="No active debts. Nice." />;
    else if (id === 'dt_progress') body = data.debtStart > 0
      ? (<View style={{ gap: 10 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 13, color: c('fgMuted') }}>Paid off</Text><Text style={[num(600), { fontSize: 13, color: c('income') }]}>{m0(data.debtPaid)} of {m0(data.debtStart)}</Text></View><ProgressBar value={data.debtStart > 0 ? (data.debtPaid / data.debtStart) * 100 : 0} color={c('income')} height={8} /></View>)
      : <Empty text="No active debts. Nice." />;
    else if (id === 'dt_payoff') body = data.debtPayoff.length > 1 ? <LineChart data={data.debtPayoff} color={c('expense')} format={m0} /> : <Empty text="No active debts. Nice." />;
    else if (id === 'gl_progress') body = data.goals.length
      ? (<View style={{ gap: 12 }}>{data.goals.map((g, gi) => (<View key={gi} style={{ gap: 4 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 12, color: c('fg') }}>{g.name}</Text><Text style={[num(600), { fontSize: 11, color: c('fgMuted') }]}>{Math.round(g.pct)}%</Text></View><ProgressBar value={g.pct} color={c('primary')} height={6} /></View>))}</View>)
      : <Empty text="Add a savings goal to track it." />;
    else if (id === 'gl_contrib') body = <LineChart data={data.goalContribMonthly} color={c('primary')} format={m0} />;
    else if (id === 'gl_total') body = (<View style={{ gap: 10 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 13, color: c('fgMuted') }}>Saved</Text><Text style={[num(600), { fontSize: 13, color: c('primary') }]}>{m0(data.goalSaved)} of {m0(data.goalTarget)}</Text></View><ProgressBar value={data.goalTarget > 0 ? (data.goalSaved / data.goalTarget) * 100 : 0} color={c('primary')} height={8} /></View>);
    else if (id === 'nw_split') {
      const t = data.needs + data.wants;
      body = t > 0
        ? (<View style={{ gap: 12 }}><View style={{ height: 16, borderRadius: 9999, overflow: 'hidden', flexDirection: 'row', backgroundColor: c('surfaceSecondary') }}><View style={{ width: `${(data.needs / t) * 100}%`, backgroundColor: c('primary') }} /><View style={{ width: `${(data.wants / t) * 100}%`, backgroundColor: c('warning') }} /></View><View style={{ flexDirection: 'row', gap: 12 }}><SplitStat label="Needs" value={m0(data.needs)} pct={Math.round((data.needs / t) * 100)} color={c('primary')} /><SplitStat label="Wants" value={m0(data.wants)} pct={Math.round((data.wants / t) * 100)} color={c('warning')} /></View></View>)
        : <Empty text="No spending in this range." />;
    } else if (id === 'nw_trend2') body = data.needsWantsMonthly.some((x) => x.needs || x.wants)
      ? (<View style={{ gap: 8 }}>{data.needsWantsMonthly.map((mm) => { const t = mm.needs + mm.wants || 1; return (<View key={mm.label} style={{ gap: 3 }}><Text style={{ fontSize: 10, color: c('fgMuted') }}>{mm.label}</Text><View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c('surfaceSecondary') }}><View style={{ width: `${(mm.needs / t) * 100}%`, backgroundColor: c('primary') }} /><View style={{ width: `${(mm.wants / t) * 100}%`, backgroundColor: c('warning') }} /></View></View>); })}</View>)
      : <Empty />;
    else if (id === 'nw_rule') {
      const inc = data.totalIncome || 0;
      const needPct = inc > 0 ? Math.round((data.needs / inc) * 100) : 0;
      const wantPct = inc > 0 ? Math.round((data.wants / inc) * 100) : 0;
      const savePct = inc > 0 ? Math.max(0, 100 - needPct - wantPct) : 0;
      body = inc > 0
        ? (<View style={{ gap: 10 }}>{[['Needs', needPct, 50], ['Wants', wantPct, 30], ['Savings', savePct, 20]].map(([label, actual, target]) => (<View key={label} style={{ gap: 3 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 12, color: c('fg') }}>{label}</Text><Text style={[num(600), { fontSize: 11, color: c('fgMuted') }]}>{actual}% · target {target}%</Text></View><ProgressBar value={actual} color={actual <= target + 5 ? c('income') : c('warning')} height={6} /></View>))}</View>)
        : <Empty text="Log income to compare to 50/30/20." />;
    } else if (id === 'fc_balance') body = (
      <View style={{ gap: 8 }}>
        {data.forecast.lowBalanceMonth != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: c('expense', 0.1), borderWidth: 1, borderColor: c('expense', 0.3) }}>
            <Icon name="alertTriangle" size={16} color={c('expense')} />
            <Text style={{ flex: 1, fontSize: 12, color: c('fg') }}>{`At this pace, your spendable balance runs low in about ${data.forecast.lowBalanceMonth} month${data.forecast.lowBalanceMonth === 1 ? '' : 's'}.`}</Text>
          </View>
        ) : null}
        <LineChart data={data.forecast.series} color={data.forecast.monthlyNet >= 0 ? c('income') : c('expense')} format={m0} />
        <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center' }}>{data.forecast.basis === 'history' ? 'Projected from your recent spending patterns' : 'Projected from your recurring items — a few months of history sharpens this'}</Text>
      </View>
    );
    else if (id === 'fc_runrate') body = (<View style={{ gap: 8 }}>{[['Recurring income', data.forecast.monthlyIncome, c('income')], ['Recurring expenses', data.forecast.monthlyExpense, c('expense')], ['Bills', data.forecast.monthlyBills, c('warning')]].map(([label, val, col]) => (<View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 13, color: c('fgMuted') }}>{label}</Text><Text style={[num(600), { fontSize: 13, color: col }]}>{m0(val)}</Text></View>))}<View style={{ height: 1, backgroundColor: c('border', 0.5), marginVertical: 2 }} /><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>Recurring net / month</Text><Text style={[num(700), { fontSize: 13, color: data.forecast.recurringNet >= 0 ? c('income') : c('expense') }]}>{m0(data.forecast.recurringNet)}</Text></View></View>);
    else if (id === 'fc_bills') body = data.upcomingBills.length
      ? (<View style={{ gap: 10 }}>{data.upcomingBills.map((b, i) => (<View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 13, color: c('fg') }}>{b.name}</Text><Text style={[num(600), { fontSize: 13, color: c('fg') }]}>{m0(b.amount)}</Text></View>))}</View>)
      : <Empty text="No bills due this month." />;

    return <ShareCard key={id} title={title}>{body}</ShareCard>;
  };

  // ── DETAIL VIEW ─────────────────────────────────────────────
  if (openCat) {
    const cat = CATS.find((x) => x.id === openCat);
    return (
      <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
        <Pressable onPress={() => setOpenCat(null)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="chevronLeft" size={18} color={c('primary')} />
          <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('primary') }}>Analytics</Text>
        </Pressable>
        <Text style={{ fontSize: 20, fontFamily: ff.bold, color: c('fg') }}>{cat.label}</Text>
        {RangeChips}
        {CurrencyNote}
        {cat.graphs.map(renderGraph)}
        <CategoryDrilldownSheet open={!!drill} category={drill} onClose={() => setDrill(null)} />
      </View>
    );
  }

  // ── HUB VIEW ────────────────────────────────────────────────
  return (
    <Reveal y={6} style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      {RangeChips}
      {CurrencyNote}
      <HealthScoreCard data={data} currency={settings.currency} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {CATS.map((cat, i) => (
          <Reveal key={cat.id} delay={i * 45} style={{ width: '47.8%' }}>
            <Pressable onPress={() => setOpenCat(cat.id)} style={({ pressed }) => [{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 12 }, pressed && { backgroundColor: c('surfaceHover') }]}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: alpha(c(cat.color), 0.16), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={cat.icon} size={18} color={c(cat.color)} />
              </View>
              <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg'), marginTop: 8 }}>{cat.label}</Text>
              <Text style={{ fontSize: 11, color: c('fgMuted') }}>{cat.graphs.length} graphs</Text>
              <View style={{ marginTop: 8 }}><TilePreview id={cat.id} /></View>
            </Pressable>
          </Reveal>
        ))}
      </View>
      <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', marginTop: 2 }}>Tap a category to explore its graphs.</Text>
    </Reveal>
  );
}

/** Financial-health score — one explainable 0–100 number from existing data. */
function HealthScoreCard({ data, currency }) {
  const monthly = data.monthly || [];
  // Only months with actual activity count. `monthly` is always a fixed 6- or
  // 12-slot trend series (even when the range is "Month"), so blindly dropping
  // the last slot to avoid partial-month skew used to leave a brand-new user
  // averaging nothing but EMPTY months — reporting 0% saved while the dashboard
  // said 63%. Drop the in-progress month only when there's older history to use.
  const active = monthly.filter((m) => (m.income || 0) > 0 || (m.expense || 0) > 0);
  const complete = active.length > 1 ? active.slice(0, -1) : active;
  const avg = (arr, sel) => (arr.length ? arr.reduce((s, x) => s + sel(x), 0) / arr.length : 0);
  const avgMonthlyExpense = avg(complete, (m) => m.expense);
  const avgMonthlyIncome = avg(complete, (m) => m.income);
  const savingsRate = complete.length ? Math.round(avg(complete, (m) => m.savingsRate)) : (data.totalIncome > 0 ? Math.round((data.net / data.totalIncome) * 100) : 0);
  const liquidAssets = data.forecast?.series?.[0]?.value ?? 0;
  const bva = data.budgetVsActual || [];
  const budgetAdherence = bva.length ? bva.filter((b) => b.actual <= b.limit).length / bva.length : null;
  // Money owed on credit accounts is real debt. `debtTotal` only sums the debts
  // TABLE, so a maxed-out card used to score a perfect "No tracked debt".
  const totalDebt = (data.debtTotal || 0) + Math.max(0, data.totalLiabilities || 0);
  // No income on record cannot mean "your debt is exactly 1× income" — that
  // invented a maximum debt penalty. Unmeasurable (null) unless there is no debt,
  // which is a real zero.
  const debtToIncome = avgMonthlyIncome > 0 ? totalDebt / (avgMonthlyIncome * 12) : (totalDebt > 0 ? null : 0);
  const spendTrendPct = complete.length >= 2 && complete[complete.length - 2].expense > 0
    ? ((complete[complete.length - 1].expense - complete[complete.length - 2].expense) / complete[complete.length - 2].expense) * 100
    : 0;

  const hs = computeHealthScore({
    liquidAssets, avgMonthlyExpense, savingsRate, budgetAdherence, debtToIncome, spendTrendPct,
    hasIncomeHistory: avgMonthlyIncome > 0 || (data.totalIncome || 0) > 0,
    monthsOfHistory: complete.length,
  });
  const tone = hs.insufficient ? c('fgMuted') : hs.score >= 70 ? c('income') : hs.score >= 55 ? c('warning') : c('expense');

  return (
    <Card title="Financial health">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 }}>
        <RingProgress percentage={hs.score ?? 0} size={78} strokeWidth={7} color={tone}>
          <View style={{ alignItems: 'center' }}>
            <Text style={[num(700), { fontSize: 22, color: c('fg') }]}>{hs.score ?? '—'}</Text>
            <Text style={{ fontSize: 8, color: c('fgMuted'), marginTop: -2 }}>/ 100</Text>
          </View>
        </RingProgress>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: ff.bold, color: tone }}>{hs.label}</Text>
          <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2, lineHeight: 16 }}>
            {hs.insufficient
              ? 'Log a bit more activity and this scores your runway, savings rate, budgets, debt and spending trend.'
              : 'Based on your runway, savings rate, budgets, debt and spending trend.'}
          </Text>
        </View>
      </View>
      <View style={{ gap: 8, marginTop: 14 }}>
        {hs.factors.map((f) => (
          <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 96 }}>
              <Text style={{ fontSize: 11, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{f.label}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {/* A factor we couldn't measure shows an empty track and a dash —
                  never a filled bar, which would read as a real result. */}
              <ProgressBar value={f.score ?? 0} color={f.score == null ? c('border') : f.score >= 70 ? c('income') : f.score >= 45 ? c('warning') : c('expense')} height={5} />
              <Text style={{ fontSize: 9.5, color: c('fgMuted'), marginTop: 3 }} numberOfLines={1}>{f.detail}</Text>
            </View>
            <Text style={[num(600), { fontSize: 11, color: c('fgMuted'), width: 26, textAlign: 'right' }]}>{f.score ?? '—'}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function StatRow({ label, value, color }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 13, color: c('fgMuted') }}>{label}</Text><Text style={[num(600), { fontSize: 13, color: color || c('fg') }]}>{value}</Text></View>;
}
function SplitStat({ label, value, pct, color }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: alpha(color, 0.1) }}>
      <Text style={{ fontSize: 10, color: c('fgMuted'), textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={[num(700), { fontSize: 16, color, marginTop: 2 }]}>{value}</Text>
      <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{pct}%</Text>
    </View>
  );
}
