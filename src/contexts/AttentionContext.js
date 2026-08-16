import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalISODate } from '../lib/date';
import { useAuth } from './AuthContext';
import { useRefresh } from './RefreshContext';
import { useSettings } from './SettingsContext';
import { useFx } from './FxContext';

/**
 * "Needs attention" feed — a single, app-wide aggregation of the things a user
 * should act on: overdue / due-soon bills, over-budget categories, goal
 * deadlines, and an unverified email. Computed once (not per screen) and
 * refreshed on the same pull-to-refresh tick as everything else, so the header
 * bell and the Attention screen share one source of truth.
 */
const AttentionContext = createContext({ items: [], count: 0, reload: () => {} });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AttentionProvider({ children }) {
  const { user, isEmailVerified } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!user) { setItems([]); return; }
    const now = new Date();
    const today = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();
    const monthStart = toLocalISODate(new Date(year, month, 1));
    const monthEnd = toLocalISODate(new Date(year, month + 1, 1));

    try {
      const [billsRes, statusRes, goalsRes, budgetsRes, catsRes, expRes, acctRes] = await Promise.all([
        supabase.from('bills').select('id, name, due_day, is_active').eq('user_id', user.id).eq('is_active', true),
        supabase.from('bill_statuses').select('bill_id, is_paid').eq('user_id', user.id).eq('month', month).eq('year', year),
        supabase.from('savings_goals').select('name, target_amount, current_amount, deadline') /* currency-safe: same-row ratio only */.eq('user_id', user.id),
        supabase.from('budgets').select('category_id, monthly_limit, currency').eq('user_id', user.id),
        supabase.from('categories').select('id, name').eq('user_id', user.id),
        supabase.from('expenses').select('amount, category, account_id').eq('user_id', user.id).gte('date', monthStart).lt('date', monthEnd),
        supabase.from('accounts').select('id, currency').eq('user_id', user.id),
      ]);

      // This feed compares a budget limit against a month of spend. Both sides
      // have to be in the same currency first: expenses are denominated in their
      // account, budgets in their own `currency` column. Summed raw, a mix of
      // accounts produced phantom "over budget" alerts.
      const displayCur = settings.currency;
      const acctCur = {};
      (acctRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
      const cvt = (amount, accId) => convert(Number(amount || 0), acctCur[accId] || displayCur, displayCur);
      const rowCvt = (amount, cur) => convert(Number(amount || 0), cur || displayCur, displayCur);

      const out = [];

      // Bills — overdue and due-soon (unpaid).
      const paidIds = new Set((statusRes.data || []).filter((s) => s.is_paid).map((s) => s.bill_id));
      (billsRes.data || []).forEach((b) => {
        if (paidIds.has(b.id)) return;
        if (b.due_day < today) {
          out.push({ id: `bill-od-${b.id}`, type: 'overdue', priority: 0, icon: 'alertTriangle', tone: 'expense', title: `${b.name} is overdue`, subtitle: `Due on the ${b.due_day}${nth(b.due_day)} · tap to pay`, nav: 'bills' });
        } else if (b.due_day <= today + 3) {
          out.push({ id: `bill-soon-${b.id}`, type: 'due', priority: 2, icon: 'calendar', tone: 'warning', title: `${b.name} due soon`, subtitle: b.due_day === today ? 'Due today' : `Due in ${b.due_day - today} day${b.due_day - today === 1 ? '' : 's'}`, nav: 'bills' });
        }
      });

      // Over-budget categories this month.
      const nameById = {};
      (catsRes.data || []).forEach((cat) => { nameById[cat.id] = cat.name; });
      const budgetByName = {};
      (budgetsRes.data || []).forEach((bd) => { const n = nameById[bd.category_id]; if (n) budgetByName[n] = rowCvt(bd.monthly_limit, bd.currency); });
      const spentByName = {};
      (expRes.data || []).forEach((e) => {
        const key = UUID_RE.test(e.category || '') && nameById[e.category] ? nameById[e.category] : e.category;
        if (!key) return;
        spentByName[key] = (spentByName[key] || 0) + cvt(e.amount, e.account_id);
      });
      Object.keys(budgetByName).forEach((name) => {
        const limit = budgetByName[name];
        const spent = spentByName[name] || 0;
        if (limit > 0 && spent > limit) {
          out.push({ id: `budget-${name}`, type: 'budget', priority: 1, icon: 'scale', tone: 'expense', title: `Over budget on ${name}`, subtitle: 'Tap to review your budget', nav: 'budget' });
        }
      });

      // Goals with a deadline coming up that aren't done.
      (goalsRes.data || []).forEach((g, i) => {
        const target = Number(g.target_amount || 0);
        const current = Number(g.current_amount || 0);
        if (target > 0 && current >= target) return;
        if (!g.deadline) return;
        const days = Math.ceil((new Date(g.deadline + 'T00:00:00') - now) / 86400000);
        if (days >= 0 && days <= 21) {
          out.push({ id: `goal-${i}`, type: 'goal', priority: 3, icon: 'target', tone: 'primary', title: `“${g.name}” deadline near`, subtitle: days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left to hit your target`, nav: 'goals' });
        }
      });

      // Unverified email.
      if (!isEmailVerified) {
        out.push({ id: 'email', type: 'email', priority: 4, icon: 'bell', tone: 'warning', title: 'Verify your email', subtitle: 'Confirm your address to secure your account', nav: 'profile' });
      }

      out.sort((a, b) => a.priority - b.priority);
      setItems(out);
    } catch {
      // Attention is best-effort — never block the app on it.
    }
  }, [user, isEmailVerified, settings.currency, convert]);

  useEffect(() => { load(); }, [load, tick]);

  return <AttentionContext.Provider value={{ items, count: items.length, reload: load }}>{children}</AttentionContext.Provider>;
}

function nth(d) {
  if (d >= 11 && d <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] || 'th';
}

export function useAttention() {
  return useContext(AttentionContext);
}
