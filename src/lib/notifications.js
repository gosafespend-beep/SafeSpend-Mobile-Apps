import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toLocalISODate } from './date';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function ensureNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const { status: asked } = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
  return asked === 'granted';
}

/**
 * Like ensureNotificationPermission but reports *why* it failed, so the UI can
 * offer a recovery path. `blocked: true` means the OS won't show the prompt
 * again (the user must re-enable in system settings).
 */
export async function requestNotifPermission() {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.status === 'granted') return { granted: true, blocked: false };
  const res = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
  return { granted: res.status === 'granted', blocked: res.status !== 'granted' && res.canAskAgain === false };
}

// One-off "come back and finish" nudge ~24h after onboarding, cancelled the
// moment the user logs their first transaction. Best-effort (needs permission).
const ACTIVATION_NUDGE_ID = 'activation-nudge';

export async function scheduleActivationNudge() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.cancelScheduledNotificationAsync(ACTIVATION_NUDGE_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: ACTIVATION_NUDGE_ID,
      content: {
        title: 'Finish setting up SafeSpend',
        body: 'Log your first expense to see what’s safe to spend today.',
        data: { type: 'activation' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 24 * 60 * 60 },
    });
  } catch {
    /* best-effort */
  }
}

export async function cancelActivationNudge() {
  await Notifications.cancelScheduledNotificationAsync(ACTIVATION_NUDGE_ID).catch(() => {});
}

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const iso = toLocalISODate;
  return { start: iso(start), end: iso(end) };
}

/**
 * Single scheduler for all local notifications. Cancels everything then reschedules
 * (a) bill reminders 1 day before each unpaid bill (this + next month), and
 * (b) a weekly "your summary is ready" nudge (Mondays 9am) — each honoring its pref.
 * Because scheduling clears all, both must be (re)scheduled here together.
 */
export async function syncNotifications(userId) {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('bill_reminders, weekly_summary')
    .eq('user_id', userId)
    .maybeSingle();
  const billsOn = prefs ? prefs.bill_reminders !== false : true;
  const weeklyOn = prefs ? prefs.weekly_summary !== false : true;

  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  const granted = await ensureNotificationPermission();
  if (!granted) return 0;

  let scheduled = 0;

  // (a) Bill reminders.
  if (billsOn) {
    const { data: bills } = await supabase
      .from('bills').select('id, name, due_day').eq('user_id', userId).eq('is_active', true);
    const now = new Date();
    for (const offset of [0, 1]) {
      const y = now.getFullYear();
      const mo = now.getMonth() + offset;
      const daysInMonth = new Date(y, mo + 1, 0).getDate();
      for (const b of bills || []) {
        const dueDay = Math.min(Math.max(1, b.due_day || 1), daysInMonth);
        const due = new Date(y, mo, dueDay, 9, 0, 0);
        const remindAt = new Date(due.getTime() - 24 * 60 * 60 * 1000);
        if (remindAt <= now) continue;
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Upcoming bill', body: `${b.name} is due tomorrow.`, data: { billId: b.id } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindAt },
        }).catch(() => {});
        scheduled += 1;
      }
    }
  }

  // (b) Weekly summary nudge — repeating, Mondays at 9am.
  if (weeklyOn) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Your week in money', body: 'Open SafeSpend to see last week’s spending and what’s safe to spend.', data: { type: 'weekly_summary' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 2, hour: 9, minute: 0 }, // 1=Sun … 2=Mon
    }).catch(() => {});
    scheduled += 1;
  }

  return scheduled;
}

// Back-compat alias — older call sites used syncBillReminders.
export const syncBillReminders = syncNotifications;

/**
 * On app open: if any budgeted category is at/over its limit this month and we
 * haven't already alerted for it this month, fire an immediate local notification.
 * Honors the budget_alerts preference. State is tracked in AsyncStorage to avoid spam.
 */
export async function checkBudgetAlerts(userId, { currency = 'USD', convert = (a) => a } = {}) {
  const { data: prefs } = await supabase
    .from('notification_preferences').select('budget_alerts').eq('user_id', userId).maybeSingle();
  const enabled = prefs ? prefs.budget_alerts !== false : true;
  if (!enabled) return 0;

  const { start, end } = monthBounds();
  const monthKey = start.slice(0, 7); // YYYY-MM

  const [{ data: cats }, { data: budgets }, { data: expenses }, { data: accounts }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('user_id', userId),
    supabase.from('budgets').select('category_id, monthly_limit, currency').eq('user_id', userId),
    supabase.from('expenses').select('amount, category, account_id').eq('user_id', userId).gte('date', start).lt('date', end),
    supabase.from('accounts').select('id, currency').eq('user_id', userId),
  ]);
  if (!budgets || budgets.length === 0) return 0;

  // Convert each expense from its account's currency so multi-currency users get
  // correct budget totals (a no-op for single-currency).
  const acctCur = {}; (accounts || []).forEach((a) => { acctCur[a.id] = a.currency; });
  const cvt = (amt, accId) => convert(Number(amt || 0), acctCur[accId] || currency, currency);

  const nameById = {};
  (cats || []).forEach((c) => { nameById[c.id] = c.name; });
  // Resolve legacy category ids → names so alert spend matches the Budget screen.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const catName = (v) => (UUID_RE.test(v || '') && nameById[v] ? nameById[v] : (v || 'Uncategorized'));
  const spentByName = {};
  (expenses || []).forEach((e) => { const k = catName(e.category); spentByName[k] = (spentByName[k] || 0) + cvt(e.amount, e.account_id); });

  const granted = await ensureNotificationPermission();
  if (!granted) return 0;

  const raw = await AsyncStorage.getItem('budget_alert_state');
  const state = raw ? JSON.parse(raw) : {};
  if (state.month !== monthKey) { state.month = monthKey; state.alerted = {}; }

  let fired = 0;
  for (const b of budgets) {
    const name = nameById[b.category_id];
    const limit = convert(Number(b.monthly_limit || 0), b.currency || currency, currency);
    if (!name || limit <= 0) continue;
    const spent = spentByName[name] || 0;
    const pct = (spent / limit) * 100;
    const level = pct > 100 ? 'over' : pct >= 90 ? 'near' : null;
    if (!level) continue;
    if (state.alerted[b.category_id] === level) continue; // already told them at this level
    await Notifications.scheduleNotificationAsync({
      content: {
        title: level === 'over' ? `Over budget: ${name}` : `Almost over: ${name}`,
        body: level === 'over'
          ? `You've exceeded your ${name} budget this month.`
          : `You're at ${Math.round(pct)}% of your ${name} budget.`,
        data: { type: 'budget_alert', categoryId: b.category_id },
      },
      trigger: null, // immediate
    }).catch(() => {});
    state.alerted[b.category_id] = level;
    fired += 1;
  }
  await AsyncStorage.setItem('budget_alert_state', JSON.stringify(state));
  return fired;
}
