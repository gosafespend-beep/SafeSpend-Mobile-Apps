import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { usePeriod } from '../contexts/PeriodContext';
import { normalizeIcon } from '../lib/icons';
import { cacheGet, cacheSet } from '../lib/cache';

const EXPENSE_ICON = {
  Groceries: 'shopping', 'Eating out': 'utensils', Transport: 'car', Bills: 'receipt',
  Utilities: 'zap', 'Subscript.': 'film', Subscriptions: 'film', Fun: 'sparkles',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iconFor(type, cat) {
  if (type === 'income') return 'wallet';
  return EXPENSE_ICON[cat] || 'shopping';
}

function timeOf(createdAt) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const fmt = (opts) => new Intl.DateTimeFormat('en-US', opts).format(d);
  if (d.getTime() === today.getTime()) return `Today, ${fmt({ month: 'short', day: 'numeric' })}`;
  if (d.getTime() === yest.getTime()) return `Yesterday, ${fmt({ month: 'short', day: 'numeric' })}`;
  return fmt({ month: 'short', day: 'numeric' });
}

/**
 * All transactions (expenses + incomes), newest first, grouped by day with
 * per-day in/out totals. `filter` is one of: All | Income | Expenses.
 * Pass `{ allTime: true }` to ignore the selected period (used by Search, so
 * results aren't silently limited to the current month/year).
 */
export function useTransactions(filter = 'All', { allTime = false } = {}) {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { start: pStart, end: pEnd } = usePeriod();
  const start = allTime ? '1970-01-01' : pStart;
  const end = allTime ? '9999-12-31' : pEnd;
  const limit = allTime ? 2000 : 500;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
    const [expRes, incRes, catRes, acctRes] = await Promise.all([
      supabase.from('expenses').select('id, amount, category, note, date, created_at, account_id').eq('user_id', user.id).gte('date', start).lt('date', end).order('date', { ascending: false }).limit(limit),
      supabase.from('incomes').select('id, amount, source, category, note, date, created_at, account_id').eq('user_id', user.id).gte('date', start).lt('date', end).order('date', { ascending: false }).limit(limit),
      supabase.from('categories').select('id, name, icon').eq('user_id', user.id),
      supabase.from('accounts').select('id, currency').eq('user_id', user.id),
    ]);
    // Some expenses store category as an id (from web bill-automation), most store
    // it by name — index both ways so a row shows its real category icon either way.
    const catById = {};
    const catByName = {};
    (catRes.data || []).forEach((cat) => { catById[cat.id] = cat; if (cat.name) catByName[cat.name.toLowerCase().trim()] = cat; });
    // account_id → its currency, so each row shows its native amount.
    const acctCur = {};
    (acctRes.data || []).forEach((a) => { acctCur[a.id] = a.currency; });
    const catName = (v) => (UUID_RE.test(v || '') && catById[v] ? catById[v].name : v);
    const catIcon = (v) => {
      const rec = (UUID_RE.test(v || '') && catById[v]) || catByName[String(v || '').toLowerCase().trim()];
      return rec ? normalizeIcon(rec.icon) : iconFor('expense', v);
    };

    const expenses = (expRes.data || []).map((e) => ({
      id: `e-${e.id}`, type: 'expense', label: e.note || catName(e.category) || 'Expense',
      cat: catName(e.category) || '—', amount: Number(e.amount || 0), date: e.date, time: timeOf(e.created_at),
      icon: catIcon(e.category), currency: acctCur[e.account_id] || null,
    }));
    const incomes = (incRes.data || []).map((i) => ({
      id: `i-${i.id}`, type: 'income', label: i.note || i.source || 'Income',
      cat: i.source || 'Income', amount: Number(i.amount || 0), date: i.date, time: timeOf(i.created_at),
      icon: 'wallet', currency: acctCur[i.account_id] || null,
    }));
    const sorted = [...expenses, ...incomes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    setRows(sorted);
    // Cache the first page only — enough for instant cold-start/offline paint.
    if (!allTime) cacheSet(user.id, `txns:${start}`, sorted.slice(0, 200));
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, start, end, limit, allTime]);

  // Stale-while-revalidate: hydrate the period's last good rows, refresh over them.
  useEffect(() => {
    if (!user || allTime) return undefined;
    let active = true;
    cacheGet(user.id, `txns:${start}`).then((cached) => {
      if (active && cached && cached.length) setRows((cur) => (cur.length ? cur : cached));
    });
    return () => { active = false; };
  }, [user?.id, start, allTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, tick]);

  const days = useMemo(() => {
    const filtered = rows.filter((r) =>
      filter === 'All' ? true : filter === 'Income' ? r.type === 'income' : r.type === 'expense'
    );
    const byDate = {};
    filtered.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
    return Object.keys(byDate)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((date) => {
        const items = byDate[date];
        const total = items.reduce(
          (acc, t) => { if (t.type === 'income') acc.in += t.amount; else acc.out += t.amount; return acc; },
          { in: 0, out: 0 }
        );
        return { date, label: dayLabel(date), total, items };
      });
  }, [rows, filter]);

  return { days, loading, error, reload: load, empty: rows.length === 0 };
}
