import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalISODate } from '../lib/date';
import { normalizeIcon } from '../lib/icons';
import { useAuth } from '../contexts/AuthContext';

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const iso = toLocalISODate;
  return { start: iso(start), end: iso(end) };
}

const EXPENSE_ICON = {
  Groceries: 'shopping', 'Eating out': 'utensils', Transport: 'car', Bills: 'receipt',
  Utilities: 'zap', 'Subscript.': 'film', Subscriptions: 'film', Fun: 'sparkles',
};

/** This month's in/out for an account + its recent activity. */
export function useAccountActivity(accountId) {
  const { user } = useAuth();
  const [data, setData] = useState({ monthIn: 0, monthOut: 0, txns: [], loading: true });

  useEffect(() => {
    if (!user || !accountId) { setData((d) => ({ ...d, loading: false })); return; }
    let active = true;
    (async () => {
      const { start, end } = monthBounds();
      const [expRes, incRes, catRes] = await Promise.all([
        supabase.from('expenses').select('amount, category, note, date').eq('user_id', user.id).eq('account_id', accountId) /* currency-safe: single account, shown in that account's currency */.order('date', { ascending: false }).limit(50),
        supabase.from('incomes').select('amount, source, note, date').eq('user_id', user.id).eq('account_id', accountId) /* currency-safe: single account, shown in that account's currency */.order('date', { ascending: false }).limit(50),
        supabase.from('categories').select('name, icon').eq('user_id', user.id),
      ]);
      if (!active) return;
      // Resolve each expense's real category icon (categories are stored by name).
      const catByName = {};
      (catRes.data || []).forEach((cat) => { if (cat.name) catByName[cat.name.toLowerCase().trim()] = cat; });
      const catIcon = (v) => {
        const rec = catByName[String(v || '').toLowerCase().trim()];
        return rec ? normalizeIcon(rec.icon) : (EXPENSE_ICON[v] || 'shopping');
      };
      const inMonth = (x) => x.date >= start && x.date < end;
      const monthOut = (expRes.data || []).filter(inMonth).reduce((s, e) => s + Number(e.amount || 0), 0);
      const monthIn = (incRes.data || []).filter(inMonth).reduce((s, i) => s + Number(i.amount || 0), 0);
      const txns = [
        ...(expRes.data || []).map((e) => ({ type: 'expense', label: e.note || e.category || 'Expense', amount: Number(e.amount || 0), date: e.date, icon: catIcon(e.category) })),
        ...(incRes.data || []).map((i) => ({ type: 'income', label: i.note || i.source || 'Income', amount: Number(i.amount || 0), date: i.date, icon: 'wallet' })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
      setData({ monthIn, monthOut, txns, loading: false });
    })();
    return () => { active = false; };
  }, [user, accountId]);

  return data;
}

export function useGoalContributions(goalId) {
  const { user } = useAuth();
  const [rows, setRows] = useState({ items: [], loading: true });
  useEffect(() => {
    if (!user || !goalId) { setRows({ items: [], loading: false }); return; }
    let active = true;
    (async () => {
      const { data } = await supabase.from('goal_contributions').select('amount, date, note') /* denominated in the goal's currency; GoalDetailScreen converts to display */.eq('user_id', user.id).eq('goal_id', goalId).order('date', { ascending: false }).limit(50);
      if (!active) return;
      setRows({ items: (data || []).map((c) => ({ amount: Number(c.amount || 0), date: c.date, note: c.note || 'Contribution' })), loading: false });
    })();
    return () => { active = false; };
  }, [user, goalId]);
  return rows;
}

export function useDebtPayments(debtId) {
  const { user } = useAuth();
  const [rows, setRows] = useState({ items: [], loading: true });
  useEffect(() => {
    if (!user || !debtId) { setRows({ items: [], loading: false }); return; }
    let active = true;
    (async () => {
      const { data } = await supabase.from('debt_payments').select('amount, date, note') /* denominated in the debt's currency; DebtDetailScreen converts to display */.eq('user_id', user.id).eq('debt_id', debtId).order('date', { ascending: false }).limit(50);
      if (!active) return;
      setRows({ items: (data || []).map((p) => ({ amount: Number(p.amount || 0), date: p.date, note: p.note || 'Payment' })), loading: false });
    })();
    return () => { active = false; };
  }, [user, debtId]);
  return rows;
}

/** Enrich a list txn (id like "e-<uuid>"/"i-<uuid>") with note + account name. */
export function useTransactionDetail(txn) {
  const { user } = useAuth();
  const [extra, setExtra] = useState({ note: null, account: null });
  useEffect(() => {
    if (!user || !txn?.id) return;
    const [prefix, rawId] = String(txn.id).split(/-(.+)/);
    const table = prefix === 'e' ? 'expenses' : prefix === 'i' ? 'incomes' : null;
    if (!table || !rawId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from(table).select('note, account_id').eq('id', rawId).maybeSingle();
      if (!active || !data) return;
      let account = null;
      if (data.account_id) {
        const { data: acc } = await supabase.from('accounts').select('name').eq('id', data.account_id).maybeSingle();
        account = acc?.name || null;
      }
      setExtra({ note: data.note, account });
    })();
    return () => { active = false; };
  }, [user, txn?.id]);
  return extra;
}
