import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toLocalISODate } from './date';
import { computeBalances } from './balances';
import { computeAvailableToSpend } from './available';
import { money } from './format';
import { ensureNotificationPermission } from './notifications';
import { merchantKey } from './merchantRules';

// Turns the intelligence the app already computes into things the user actually
// feels: a predicted month-end shortfall, an unusual charge, and newly-detected
// recurring subscriptions. Runs on app open (like checkBudgetAlerts), fires local
// notifications, and de-dupes via AsyncStorage so nothing nags twice.
//
// Called from RootNavigator with the live FX converter + display currency so
// multi-currency users get correct totals.

const STATE_KEY = 'proactive_alert_state';
const keyOf = (s) => merchantKey(s); // same normalizer as subscription detection

export async function checkProactiveAlerts(userId, { currency = 'USD', convert = (a) => a, enabled = true } = {}) {
  if (!userId || !enabled) return 0;
  try {
    const now = new Date();
    const y = now.getFullYear(); const mo = now.getMonth();
    const monthKey = `${y}-${String(mo + 1).padStart(2, '0')}`;
    const todayISO = toLocalISODate(now);
    const trailingStart = toLocalISODate(new Date(y, mo, now.getDate() - 90));
    const curMonthStart = toLocalISODate(new Date(y, mo, 1));
    const subSince = toLocalISODate(new Date(y, mo - 4, 1));

    const [accRes, allExpRes, allIncRes, allXferRes, trailRes, billsRes, statusRes, goalsRes, recurRes] = await Promise.all([
      supabase.from('accounts').select('id, initial_balance, type, is_active, currency').eq('user_id', userId),
      supabase.from('expenses').select('account_id, amount').eq('user_id', userId),
      supabase.from('incomes').select('account_id, amount').eq('user_id', userId),
      supabase.from('transfers').select('from_account_id, to_account_id, amount, to_amount').eq('user_id', userId),
      supabase.from('expenses').select('amount, category, note, date, account_id, created_at').eq('user_id', userId).gte('date', trailingStart).order('date', { ascending: true }),
      supabase.from('bills').select('id, name, amount, currency, due_day, is_active').eq('user_id', userId),
      supabase.from('bill_statuses').select('bill_id, is_paid').eq('user_id', userId).eq('month', mo).eq('year', y),
      supabase.from('savings_goals').select('target_amount, current_amount, currency, deadline').eq('user_id', userId),
      supabase.from('recurring_transactions').select('type, amount, next_due, is_active, account_id').eq('user_id', userId),
    ]);

    const accounts = accRes.data || [];
    const acctCur = {}; accounts.forEach((a) => { acctCur[a.id] = a.currency; });
    const cvt = (amt, accId) => convert(Number(amt || 0), acctCur[accId] || currency, currency);
    const fmt = (n) => money(n, { currency, cents: false });

    const bal = computeBalances(accounts, allExpRes.data || [], allIncRes.data || [], allXferRes.data || [], { convert, displayCurrency: currency });
    const trail = trailRes.data || [];
    const trailTotal = trail.reduce((s, e) => s + cvt(e.amount, e.account_id), 0);
    const avgDailySpend = trailTotal / 90;

    // Bills/goals are per-row denominated and recurring amounts are account-native;
    // convert each into the display currency before the maths (same as the dashboard).
    const toDisplay = (amount, cur) => convert(Number(amount || 0), cur || currency, currency);
    const available = computeAvailableToSpend({
      liquidBalance: bal.liquidAssets,
      bills: (billsRes.data || []).map((b) => ({ ...b, amount: toDisplay(b.amount, b.currency) })),
      billStatuses: statusRes.data || [],
      goals: (goalsRes.data || []).map((g) => ({
        ...g,
        target_amount: toDisplay(g.target_amount, g.currency),
        current_amount: toDisplay(g.current_amount, g.currency),
      })),
      recurring: (recurRes.data || []).map((r) => ({ ...r, amount: cvt(r.amount, r.account_id) })),
      avgDailySpend,
      now,
    });

    const granted = await ensureNotificationPermission();
    if (!granted) return 0;

    const raw = await AsyncStorage.getItem(STATE_KEY);
    let state = raw ? JSON.parse(raw) : {};
    if (state.month !== monthKey) state = { month: monthKey, shortfall: false, anomalies: {}, knownSubs: state.knownSubs || [] };
    if (!state.knownSubs) state.knownSubs = [];

    const fire = async (id, title, body, data) => {
      await Notifications.scheduleNotificationAsync({ content: { title, body, data: { type: 'proactive', ...data } }, trigger: null }).catch(() => {});
    };
    let fired = 0;

    // 1. Predicted month-end shortfall (once per month).
    if (!state.shortfall && (available.status === 'danger' || available.onPaceToOverspend)) {
      const body = available.status === 'danger'
        ? `Your safe-to-spend is ${fmt(available.availableToSpend)} — not enough for this month's obligations.`
        : `At your usual pace you'll run short before month-end. About ${fmt(available.dailySafe)}/day keeps you safe.`;
      await fire('shortfall', 'Heads up on your budget', body, { screen: 'home' });
      state.shortfall = true; fired += 1;
    }

    // 2. Unusual charge today — a single expense far above its category's trailing norm.
    const byCat = {}; const counts = {};
    trail.filter((e) => e.date < curMonthStart).forEach((e) => {
      const k = e.category || 'Uncategorized';
      byCat[k] = (byCat[k] || 0) + cvt(e.amount, e.account_id); counts[k] = (counts[k] || 0) + 1;
    });
    const todays = trail.filter((e) => e.date === todayISO);
    for (const e of todays) {
      const k = e.category || 'Uncategorized';
      const n = counts[k] || 0;
      if (n < 3) continue; // need history to call something "unusual"
      const avg = byCat[k] / n;
      const amt = cvt(e.amount, e.account_id);
      const sig = `${e.created_at || e.date}:${Math.round(amt)}`;
      if (amt >= avg * 2.5 && amt >= avg + 20 && !state.anomalies[sig]) {
        await fire('anomaly', 'Unusual charge spotted', `${fmt(amt)} on ${e.note || k} is well above your usual ${k} spend.`, { screen: 'log' });
        state.anomalies[sig] = true; fired += 1;
        if (fired >= 3) break; // don't flood on a busy day
      }
    }

    // 3. Newly-detected subscription (monthly cadence, consistent amount, 2+ hits).
    const groups = {};
    trail.filter((e) => e.date >= subSince).forEach((e) => {
      const k = keyOf(e.note || e.category); if (!k) return;
      (groups[k] = groups[k] || []).push({ amount: cvt(e.amount, e.account_id), date: e.date, label: e.note || e.category });
    });
    const known = new Set(state.knownSubs);
    const newlyKnown = [];
    Object.entries(groups).forEach(([k, txns]) => {
      if (txns.length < 2) return;
      const amts = txns.map((t) => t.amount).sort((a, b) => a - b);
      const med = amts[Math.floor(amts.length / 2)];
      if (med <= 0 || !amts.every((a) => Math.abs(a - med) <= med * 0.2)) return;
      const days = txns.map((t) => new Date(t.date + 'T00:00:00').getTime()).sort((a, b) => a - b);
      let gap = 0; for (let i = 1; i < days.length; i++) gap += (days[i] - days[i - 1]) / 86400000;
      const avgGap = gap / (days.length - 1);
      if (avgGap < 20 || avgGap > 40) return;
      newlyKnown.push(k);
      if (!known.has(k) && state.knownSubs.length > 0 && fired < 4) {
        // Only alert once we have a baseline of known subs (avoid a first-run flood).
        fire('sub', 'New recurring charge', `Looks like ${txns[txns.length - 1].label} (~${fmt(med)}/mo) is a subscription. Track it?`, { screen: 'subscriptions' });
        fired += 1;
      }
    });
    // Union so first run seeds the baseline silently; later runs only alert on truly new ones.
    state.knownSubs = Array.from(new Set([...state.knownSubs, ...newlyKnown]));

    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
    return fired;
  } catch {
    return 0;
  }
}
