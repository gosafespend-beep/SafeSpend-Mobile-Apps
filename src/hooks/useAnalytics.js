import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalISODate } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { hsl, c } from '../theme/tokens';
import { computeBalances } from '../lib/balances';

const CHART_COLORS = ['168 76% 42%', '38 92% 50%', '45 93% 47%', '262 52% 56%', '200 70% 50%', '350 70% 55%', '158 64% 45%'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const iso = toLocalISODate;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Resolve the analytics window from the range selector.
function windowFor(range) {
  const now = new Date();
  const monthsBack = range === 'year' || range === 'all' ? 12 : 6;
  let periodStart;
  if (range === 'month') periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (range === '6mo') periodStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  else if (range === 'year') periodStart = new Date(now.getFullYear(), 0, 1);
  else periodStart = new Date(2000, 0, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const trendStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  const fetchStart = periodStart < trendStart ? periodStart : trendStart;
  return { now, monthsBack, periodStart, periodEnd, trendStart, fetchStart };
}

/**
 * One data source for the whole Analytics hub. Fetches the raw tables once for
 * the selected range and computes every series each category graph needs.
 * `range` = 'month' | '6mo' | 'year' | 'all'.
 */
export function useAnalytics(range = '6mo') {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const { now, monthsBack, periodStart, periodEnd, trendStart, fetchStart } = windowFor(range);
      const uid = user.id;
      const [
        exRes, inRes, allExpRes, allIncRes, allXferRes, acctRes, budRes, catRes,
        debtRes, goalRes, contribRes, billRes, statusRes, recurRes, assetRes, liabRes,
      ] = await Promise.all([
        supabase.from('expenses').select('amount, date, category, note, account_id').eq('user_id', uid).gte('date', iso(fetchStart)),
        supabase.from('incomes').select('amount, date, source, account_id').eq('user_id', uid).gte('date', iso(fetchStart)),
        supabase.from('expenses').select('account_id, amount').eq('user_id', uid),
        supabase.from('incomes').select('account_id, amount').eq('user_id', uid),
        supabase.from('transfers').select('from_account_id, to_account_id, amount, to_amount').eq('user_id', uid),
        supabase.from('accounts').select('id, initial_balance, type, is_active, name, color, currency').eq('user_id', uid),
        supabase.from('budgets').select('category_id, monthly_limit, currency').eq('user_id', uid),
        supabase.from('categories').select('id, name, color, is_need').eq('user_id', uid),
        supabase.from('debts').select('name, interest_rate, minimum_payment, current_balance, starting_balance, currency').eq('user_id', uid).eq('is_active', true),
        supabase.from('savings_goals').select('id, name, target_amount, current_amount, currency').eq('user_id', uid),
        supabase.from('goal_contributions').select('amount, date, goal_id').eq('user_id', uid).gte('date', iso(trendStart)),
        supabase.from('bills').select('id, name, amount, currency, due_day').eq('user_id', uid).eq('is_active', true),
        supabase.from('bill_statuses').select('bill_id, is_paid').eq('user_id', uid).eq('month', now.getMonth()).eq('year', now.getFullYear()),
        supabase.from('recurring_transactions').select('type, amount, next_due, frequency, is_active, account_id').eq('user_id', uid),
        supabase.from('assets').select('value, currency').eq('user_id', uid),
        supabase.from('liabilities').select('value, currency').eq('user_id', uid),
      ]);

      const cats = catRes.data || [];
      const byId = {}; const colorByName = {}; const needByName = {};
      cats.forEach((cat) => { byId[cat.id] = cat; colorByName[cat.name] = cat.color; needByName[cat.name] = !!cat.is_need; });
      const resolveName = (v) => (UUID_RE.test(v || '') && byId[v] ? byId[v].name : v);
      const colorFor = (name, i) => hsl(colorByName[name] || CHART_COLORS[i % CHART_COLORS.length]);

      // Pre-convert each transaction into the display currency (its account's
      // currency → display) so every flow aggregate below is currency-correct.
      // `_amt` is a no-op for single-currency users.
      const displayCur = settings.currency;
      const acctCur = {};
      (acctRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
      const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);
      // Bills, goals, debts, budgets, assets and liabilities each carry their own
      // `currency` column (NOT NULL DEFAULT 'USD') rather than inheriting an
      // account's, so they convert by row rather than by account. Declared here
      // beside `cvt` because the first use is the budget limits far above.
      const rowCvt = (v, cur) => convert(Number(v || 0), cur || displayCur, displayCur);
      const allExp = (exRes.data || []).map((e) => ({ ...e, _amt: cvt(e.amount, e.account_id) }));
      const allInc = (inRes.data || []).map((i) => ({ ...i, _amt: cvt(i.amount, i.account_id) }));
      const inPeriod = (dstr) => { const d = dstr; return d >= iso(periodStart) && d < iso(periodEnd); };

      // ── Monthly buckets (trend) ───────────────────────────────
      const months = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: monthKey(d), label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d), income: 0, expense: 0, needs: 0, wants: 0 });
      }
      const midx = {}; months.forEach((m, i) => { midx[m.key] = i; });
      allExp.forEach((e) => {
        const k = String(e.date).slice(0, 7);
        if (midx[k] != null) {
          const amt = e._amt;
          months[midx[k]].expense += amt;
          if (needByName[resolveName(e.category)]) months[midx[k]].needs += amt; else months[midx[k]].wants += amt;
        }
      });
      allInc.forEach((i2) => { const k = String(i2.date).slice(0, 7); if (midx[k] != null) months[midx[k]].income += i2._amt; });
      const monthly = months.map((m) => ({ label: m.label, income: m.income, expense: m.expense, net: m.income - m.expense, savingsRate: m.income > 0 ? Math.round(((m.income - m.expense) / m.income) * 100) : 0 }));
      let run = 0;
      const cumulative = months.map((m) => { run += m.income - m.expense; return { label: m.label, value: run }; });
      const needsWantsMonthly = months.map((m) => ({ label: m.label, needs: m.needs, wants: m.wants }));

      // ── Period aggregates ─────────────────────────────────────
      const byCat = {}; const byMerchant = {}; const weekday = WEEKDAYS.map((w) => ({ label: w, value: 0 }));
      let needs = 0; let wants = 0; let totalExpense = 0;
      allExp.filter((e) => inPeriod(String(e.date))).forEach((e) => {
        const name = resolveName(e.category) || 'Uncategorized';
        const amt = e._amt;
        byCat[name] = (byCat[name] || 0) + amt;
        const merch = (e.note || name).trim();
        byMerchant[merch] = (byMerchant[merch] || 0) + amt;
        weekday[new Date(String(e.date) + 'T00:00:00').getDay()].value += amt;
        totalExpense += amt;
        if (needByName[name]) needs += amt; else wants += amt;
      });
      const categories = Object.entries(byCat).map(([name, value], i) => ({ name, value, color: colorFor(name, i), isNeed: !!needByName[name] })).sort((a, b) => b.value - a.value);
      const donut = totalExpense > 0 ? categories.map((x) => ({ color: x.color, share: x.value / totalExpense })) : [];
      const merchants = Object.entries(byMerchant).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);

      const bySource = {}; let totalIncome = 0;
      allInc.filter((i2) => inPeriod(String(i2.date))).forEach((i2) => {
        const s = (i2.source || 'Income').trim();
        const amt = i2._amt;
        bySource[s] = (bySource[s] || 0) + amt; totalIncome += amt;
      });
      const incomeBySource = Object.entries(bySource).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

      // Budget vs actual (this-period spend against the monthly limit).
      const limitByName = {};
      (budRes.data || []).forEach((b) => { const n = byId[b.category_id]?.name; if (n) limitByName[n] = rowCvt(b.monthly_limit, b.currency); });
      const budgetVsActual = Object.entries(limitByName).filter(([, lim]) => lim > 0).map(([name, limit], i) => {
        const actual = byCat[name] || 0;
        return { label: name, actual, limit, pct: Math.min(100, (actual / limit) * 100), color: actual > limit ? c('expense') : colorFor(name, i) };
      }).sort((a, b) => b.actual - a.actual);

      // ── Balances / net worth ──────────────────────────────────
      const bal = computeBalances(acctRes.data || [], allExpRes.data || [], allIncRes.data || [], allXferRes.data || [], { convert, displayCurrency: displayCur });
      const manualAssets = (assetRes.data || []).reduce((s2, a) => s2 + rowCvt(a.value, a.currency), 0);
      const manualLiabs = (liabRes.data || []).reduce((s2, a) => s2 + rowCvt(a.value, a.currency), 0);
      const totalAssets = bal.assets + manualAssets;
      const totalLiabilities = bal.liabilities + manualLiabs;
      const netWorth = totalAssets - totalLiabilities;
      const accountsList = bal.list.filter((a) => a.isActive).map((a) => ({ label: a.name, value: Math.abs(a.balance), color: a.credit ? c('expense') : c('primary') })).sort((a, b) => b.value - a.value);
      // Net-worth trend: back-project current net worth by removing each month's net.
      const nwTrend = [];
      let nwRun = netWorth;
      for (let i = monthly.length - 1; i >= 0; i--) { nwTrend.unshift({ label: monthly[i].label, value: Math.round(nwRun) }); nwRun -= monthly[i].net; }

      // ── Debt ──────────────────────────────────────────────────
      const debts = (debtRes.data || []).map((d) => ({
        name: d.name, current: rowCvt(d.current_balance, d.currency),
        starting: rowCvt(d.starting_balance || d.current_balance, d.currency),
        apr: Number(d.interest_rate || 0), min: rowCvt(d.minimum_payment, d.currency),
      }));
      const debtTotal = debts.reduce((s, d) => s + d.current, 0);
      const debtStart = debts.reduce((s, d) => s + d.starting, 0);
      // Payoff projection: each month accrue interest, pay the total minimums,
      // then roll any freed-up payment into the highest-APR remaining debt (the
      // avalanche effect). Far more honest than a flat, interest-free line.
      const payoff = debts.filter((d) => d.current > 0)
        .map((d) => ({ bal: d.current, apr: Math.max(0, d.apr), min: Math.max(0, d.min) }))
        .sort((a, b) => b.apr - a.apr);
      const monthlyPool = payoff.reduce((s, d) => s + d.min, 0);
      const debtPayoff = [{ label: 'Now', value: Math.round(debtTotal) }];
      let mo = 0;
      while (payoff.some((d) => d.bal > 0.5) && mo < 12) {
        mo += 1;
        payoff.forEach((d) => { if (d.bal > 0) d.bal += d.bal * (d.apr / 100 / 12); }); // interest
        let pay = monthlyPool;
        payoff.forEach((d) => { if (d.bal > 0 && pay > 0) { const p = Math.min(d.min, d.bal, pay); d.bal -= p; pay -= p; } }); // minimums
        for (const d of payoff) { if (pay <= 0.005) break; if (d.bal > 0) { const p = Math.min(pay, d.bal); d.bal -= p; pay -= p; } } // extra → highest APR
        debtPayoff.push({ label: `+${mo}`, value: Math.round(payoff.reduce((s, d) => s + Math.max(0, d.bal), 0)) });
      }

      // ── Goals ─────────────────────────────────────────────────
      const goals = (goalRes.data || []).map((g) => {
        const target = rowCvt(g.target_amount, g.currency); const current = rowCvt(g.current_amount, g.currency);
        return { name: g.name, current, target, pct: target > 0 ? Math.min(100, (current / target) * 100) : 0 };
      }).sort((a, b) => b.pct - a.pct);
      const goalSaved = goals.reduce((s, g) => s + g.current, 0);
      const goalTarget = goals.reduce((s, g) => s + g.target, 0);
      const contribMonths = {};
      months.forEach((m) => { contribMonths[m.key] = 0; });
      // A contribution has no currency of its own — it is denominated in the goal
      // it was paid into, and this chart sums across ALL goals in display currency.
      const goalCur = {};
      (goalRes.data || []).forEach((g) => { goalCur[g.id] = g.currency; });
      (contribRes.data || []).forEach((cn) => { const k = String(cn.date).slice(0, 7); if (contribMonths[k] != null) contribMonths[k] += rowCvt(cn.amount, goalCur[cn.goal_id]); });
      const goalContribMonthly = months.map((m) => ({ label: m.label, value: contribMonths[m.key] || 0 }));

      // ── Forecast (history-based cash-flow) ────────────────────
      // Known recurring commitments (shown in the run-rate card).
      // Recurring rows are denominated in their account, bills in their own
      // `currency` column; both land in the same recurringNet as each other.
      const perMonth = (r) => { const f = String(r.frequency || 'monthly').toLowerCase(); let a = cvt(r.amount, r.account_id); if (f.includes('year')) a /= 12; else if (f.includes('week')) a *= 4.33; return a; };
      const activeRec = (recurRes.data || []).filter((r) => r.is_active !== false);
      const monthlyIncome = activeRec.filter((r) => r.type === 'income').reduce((s, r) => s + perMonth(r), 0);
      const monthlyRecExpense = activeRec.filter((r) => r.type === 'expense').reduce((s, r) => s + perMonth(r), 0);
      const monthlyBills = (billRes.data || []).reduce((s2, b) => s2 + rowCvt(b.amount, b.currency), 0);
      const recurringNet = monthlyIncome - monthlyRecExpense - monthlyBills;
      // Real behaviour: average net over the COMPLETE prior months (exclude the
      // current partial month). This works even when the user set up no recurring
      // items, and reflects what actually happens — not a straight line of nothing.
      const completeMonths = monthly.slice(0, -1);
      const histAvgNet = completeMonths.length ? completeMonths.reduce((s, m) => s + m.net, 0) / completeMonths.length : 0;
      const useHistory = completeMonths.length >= 2;
      const projMonthlyNet = useHistory ? histAvgNet : recurringNet;
      // Project SPENDABLE (liquid) balance forward and flag the first month it dips
      // below zero — the "you'll run low around …" cash-flow warning.
      const fcSeries = []; let fcBal = bal.liquidAssets; let lowBalanceMonth = null;
      for (let i = 0; i <= 6; i++) {
        fcSeries.push({ label: i === 0 ? 'Now' : `+${i}`, value: Math.round(fcBal) });
        if (i > 0 && fcBal < 0 && lowBalanceMonth == null) lowBalanceMonth = i;
        fcBal += projMonthlyNet;
      }
      const paidByBill = {}; (statusRes.data || []).forEach((s) => { if (s.is_paid) paidByBill[s.bill_id] = true; });
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const upcomingBills = (billRes.data || []).filter((b) => !paidByBill[b.id]).map((b) => ({ name: b.name, amount: rowCvt(b.amount, b.currency), day: Math.min(Math.max(1, b.due_day || 1), daysInMonth) })).sort((a, b) => a.day - b.day);

      setData({
        range, monthly, cumulative, needsWantsMonthly,
        categories, donut, merchants, budgetVsActual, weekday, totalExpense,
        incomeBySource, incomeStreams: incomeBySource.length, totalIncome, net: totalIncome - totalExpense,
        netWorth, totalAssets, totalLiabilities, accountsList, nwTrend,
        debts, debtTotal, debtStart, debtPaid: debtStart - debtTotal, debtPayoff,
        goals, goalSaved, goalTarget, goalContribMonthly,
        needs, wants,
        forecast: { series: fcSeries, monthlyIncome, monthlyExpense: monthlyRecExpense, monthlyBills, recurringNet, monthlyNet: projMonthlyNet, basis: useHistory ? 'history' : 'recurring', lowBalanceMonth, hasRecurring: activeRec.length > 0 },
        upcomingBills,
        multiCurrency: bal.multiCurrency,
        displayCurrency: displayCur,
      });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, range, convert, settings.currency]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
