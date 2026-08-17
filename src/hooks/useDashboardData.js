import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { toLocalISODate } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { usePeriod } from '../contexts/PeriodContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { computeBalances } from '../lib/balances';
import { computeAvailableToSpend } from '../lib/available';
import { money } from '../lib/format';
import { cacheGet, cacheSet } from '../lib/cache';

const CHART_COLORS = ['158 64% 45%', '38 92% 50%', '45 93% 47%', '262 52% 56%', '200 70% 50%', '168 76% 42%'];

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const iso = toLocalISODate;
  return { start: iso(start), end: iso(end) };
}

/**
 * Aggregates the signed-in user's current-month finances for the Dashboard.
 * All queries are RLS-scoped to the user automatically.
 */
export function useDashboardData() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { start, end } = usePeriod();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {

    const nowDate = new Date();
    const curMonth = nowDate.getMonth();
    const curYear = nowDate.getFullYear();
    // Trailing ~90 days of expenses power the "pace" + trend/anomaly intelligence.
    const trailingStart = toLocalISODate(new Date(curYear, curMonth, nowDate.getDate() - 90));
    const curMonthStartISO = toLocalISODate(new Date(curYear, curMonth, 1));
    const prevMonthStartISO = toLocalISODate(new Date(curYear, curMonth - 1, 1));

    const [accountsRes, expensesRes, incomesRes, categoriesRes, budgetsRes, allExpRes, allIncRes, allXferRes, billsRes, billStatusRes, goalsRes, recurringRes, trailingRes] = await Promise.all([
      supabase.from('accounts').select('id, initial_balance, type, is_active, currency').eq('user_id', user.id),
      supabase.from('expenses').select('id, amount, category, date, note, created_at, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
      supabase.from('incomes').select('id, amount, source, category, date, note, created_at, account_id').eq('user_id', user.id).gte('date', start).lt('date', end),
      supabase.from('categories').select('id, name, color').eq('user_id', user.id),
      supabase.from('budgets').select('monthly_limit, category_id, currency').eq('user_id', user.id),
      supabase.from('expenses').select('account_id, amount').eq('user_id', user.id),
      supabase.from('incomes').select('account_id, amount').eq('user_id', user.id),
      supabase.from('transfers').select('from_account_id, to_account_id, amount, to_amount').eq('user_id', user.id),
      supabase.from('bills').select('id, name, amount, currency, due_day, is_active').eq('user_id', user.id),
      supabase.from('bill_statuses').select('bill_id, is_paid').eq('user_id', user.id).eq('month', curMonth).eq('year', curYear),
      supabase.from('savings_goals').select('target_amount, current_amount, currency, deadline').eq('user_id', user.id),
      supabase.from('recurring_transactions').select('type, amount, next_due, is_active, description, account_id').eq('user_id', user.id),
      supabase.from('expenses').select('amount, category, date, account_id').eq('user_id', user.id).gte('date', trailingStart),
    ]);

    const accounts = accountsRes.data || [];
    const expenses = expensesRes.data || [];
    const incomes = incomesRes.data || [];
    const categories = categoriesRes.data || [];
    const budgets = budgetsRes.data || [];

    // Convert each transaction from its account's currency into the display
    // currency, so flow totals (income / expenses / net / per-category) are
    // correct across a mix of currencies. `cvt` is a no-op for single-currency.
    const displayCur = settings.currency;
    const acctCur = {};
    accounts.forEach((a) => { acctCur[a.id] = a.currency; });
    const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);

    // Map category id → name so budgets (keyed by id) can be looked up by name,
    // and so expenses that store category as an id resolve to a readable name.
    const nameById = {};
    categories.forEach((cat) => { nameById[cat.id] = cat.name; });
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const catName = (v) => (UUID_RE.test(v || '') && nameById[v] ? nameById[v] : v);
    const budgetByName = {};
    budgets.forEach((b) => { const n = nameById[b.category_id]; if (n) budgetByName[n] = convert(Number(b.monthly_limit || 0), b.currency || displayCur, displayCur); });

    // Real running net worth (consistent with Accounts + Reports), converted to
    // the user's display currency.
    const bal = computeBalances(accounts, allExpRes.data || [], allIncRes.data || [], allXferRes.data || [], { convert, displayCurrency: displayCur });
    const balance = bal.netWorth;
    const totalExpenses = expenses.reduce((s, e) => s + cvt(e.amount, e.account_id), 0);
    const totalIncome = incomes.reduce((s, i) => s + cvt(i.amount, i.account_id), 0);
    const net = totalIncome - totalExpenses;

    // Spending grouped by category name, colored from the user's categories.
    const colorByName = {};
    categories.forEach((cat) => { colorByName[cat.name] = cat.color; });
    const byCat = {};
    expenses.forEach((e) => {
      const key = catName(e.category) || 'Uncategorized';
      byCat[key] = (byCat[key] || 0) + cvt(e.amount, e.account_id);
    });
    const catList = Object.entries(byCat)
      .map(([name, total], idx) => ({
        id: name,
        name,
        total,
        budget: budgetByName[name] || 0,
        color: colorByName[name] || CHART_COLORS[idx % CHART_COLORS.length],
      }))
      .sort((a, b) => b.total - a.total);

    const totalBudget = Object.values(budgetByName).reduce((s, v) => s + v, 0);

    // Recent transactions: merge income + expense, newest first. Ids are prefixed
    // (e-/i-) and time included so the detail screen can edit/delete them.
    const timeOf = (createdAt) => {
      if (!createdAt) return '';
      const d = new Date(createdAt);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const txns = [
      ...expenses.map((e) => ({ id: `e-${e.id}`, type: 'expense', label: e.note || catName(e.category) || 'Expense', cat: catName(e.category) || '—', amount: Number(e.amount || 0), date: e.date, note: e.note || '', time: timeOf(e.created_at), icon: 'shopping', currency: acctCur[e.account_id] || null })),
      ...incomes.map((i) => ({ id: `i-${i.id}`, type: 'income', label: i.note || i.source || 'Income', cat: i.source || 'Income', amount: Number(i.amount || 0), date: i.date, note: i.note || '', time: timeOf(i.created_at), icon: 'wallet', currency: acctCur[i.account_id] || null })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);

    // Trailing-history metrics that power the pace + trend/anomaly intelligence,
    // all converted to the display currency.
    const trail = trailingRes.data || [];
    const trailTotal = trail.reduce((s, e) => s + cvt(e.amount, e.account_id), 0);
    const avgDailySpend = trailTotal / 90;
    // Prior full months (exclude the current, partial month) as the baseline.
    const priorExp = trail.filter((e) => e.date < curMonthStartISO);
    const prevMonthExpenses = priorExp
      .filter((e) => e.date >= prevMonthStartISO && e.date < curMonthStartISO)
      .reduce((s, e) => s + cvt(e.amount, e.account_id), 0);
    // Per-category ~monthly baseline over the trailing prior months (for anomaly).
    const categoryBaselines = {};
    priorExp.forEach((e) => { const k = catName(e.category) || 'Uncategorized'; categoryBaselines[k] = (categoryBaselines[k] || 0) + cvt(e.amount, e.account_id); });
    Object.keys(categoryBaselines).forEach((k) => { categoryBaselines[k] = categoryBaselines[k] / 3; });

    // Bills and goals carry their OWN currency (the column is NOT NULL DEFAULT
    // 'USD'), and a recurring row's amount is denominated in its account. Safe-to-
    // Spend subtracts these from a display-currency balance, so each has to be
    // converted first — summing them raw mixes currencies silently.
    const toDisplay = (amount, cur) => convert(Number(amount || 0), cur || displayCur, displayCur);
    const billsCvt = (billsRes.data || []).map((b) => ({ ...b, amount: toDisplay(b.amount, b.currency) }));
    const goalsCvt = (goalsRes.data || []).map((g) => ({
      ...g,
      target_amount: toDisplay(g.target_amount, g.currency),
      current_amount: toDisplay(g.current_amount, g.currency),
    }));
    const recurringCvt = (recurringRes.data || []).map((r) => ({ ...r, amount: cvt(r.amount, r.account_id) }));

    // "Safe to spend" — liquid balance minus near-term obligations, now pace-aware.
    const available = computeAvailableToSpend({
      liquidBalance: bal.liquidAssets,
      bills: billsCvt,
      billStatuses: billStatusRes.data || [],
      goals: goalsCvt,
      recurring: recurringCvt,
      avgDailySpend,
      now: nowDate,
    });

    const payload = {
      balance,
      accountCount: accounts.length,
      totalIncome,
      totalExpenses,
      net,
      categories: catList,
      totalBudget,
      txns,
      available,
      prevMonthExpenses,
      categoryBaselines,
      multiCurrency: bal.multiCurrency,
    };
    setData(payload);
    cacheSet(user.id, `dashboard:${start}`, payload);

    // Feed the Android home-screen widget: a stable key the native
    // AppWidgetProvider reads straight out of AsyncStorage's database.
    // Amount is pre-formatted here so the widget needs zero currency logic;
    // the hide-balances privacy setting masks it.
    try {
      const masked = settings.hideBalances;
      AsyncStorage.setItem('widget:safeToSpend', JSON.stringify({
        formatted: masked ? '••••' : money(available.availableToSpend, { currency: settings.currency }),
        status: available.status, // safe | caution | danger
        message: masked ? 'Balances hidden' : available.statusMessage,
        updatedAt: new Date().toISOString(),
      })).catch(() => {});
    } catch { /* widget feed is best-effort */ }
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, start, end, settings.hideBalances, settings.currency, convert]);

  // Stale-while-revalidate: show the last good numbers instantly (cold start /
  // offline) while the network fetch runs; fresh data overwrites when it lands.
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    cacheGet(user.id, `dashboard:${start}`).then((cached) => {
      if (active && cached) setData((cur) => cur || cached);
    });
    return () => { active = false; };
  }, [user?.id, start]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
