import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalISODate } from '../lib/date';
import { useAuth } from './AuthContext';
import { useRefresh } from './RefreshContext';
import { useSettings } from './SettingsContext';
import { useFx } from './FxContext';
import { buildAttention } from '../lib/attention';

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

      const paidIds = new Set((statusRes.data || []).filter((s) => s.is_paid).map((s) => s.bill_id));

      // Category names, needed to line budgets up with spend below.
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
      /*
       * The rules live in lib/attention.js, shared with the web app.
       *
       * This function used to contain them inline, and web had no feed at all.
       * Now that both surfaces show one, two copies of "what counts as overdue"
       * would drift silently — so everything above is FETCHING and currency
       * normalisation, and everything below is the shared decision.
       */
      setItems(buildAttention({
        today: now,
        bills: (billsRes.data || []).map((b) => ({
          id: b.id, name: b.name, dueDay: b.due_day, isPaid: paidIds.has(b.id),
        })),
        budgets: Object.keys(budgetByName).map((name) => ({
          category: name, limit: budgetByName[name], spent: spentByName[name] || 0,
        })),
        goals: (goalsRes.data || []).map((g) => ({
          name: g.name,
          target: Number(g.target_amount || 0),
          current: Number(g.current_amount || 0),
          deadline: g.deadline,
        })),
        emailVerified: isEmailVerified,
      }));
    } catch {
      // Attention is best-effort — never block the app on it.
    }
  }, [user, isEmailVerified, settings.currency, convert]);

  useEffect(() => { load(); }, [load, tick]);

  return <AttentionContext.Provider value={{ items, count: items.length, reload: load }}>{children}</AttentionContext.Provider>;
}

export function useAttention() {
  return useContext(AttentionContext);
}
