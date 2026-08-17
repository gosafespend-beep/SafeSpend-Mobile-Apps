import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { toUsd } from '../lib/fx';
import { hsl } from '../theme/tokens';
import { toLocalISODate } from '../lib/date';

// Bill payments post under one fixed category so bill names never pollute the
// user's category list, budgets, baselines or AI category suggestions.
const BILL_CATEGORY = 'Bills';

// Stored as ready-to-use hsl() strings (valid for Icon/SVG, backgroundColor, Text
// color, and alpha()) — bill screens use b.color directly without wrapping.
const PALETTE = ['168 76% 42%', '38 92% 50%', '262 52% 56%', '200 70% 50%', '158 64% 45%', '350 70% 55%', '45 93% 47%'].map((t) => hsl(t));

/** Active bills for the current month with paid status from bill_statuses. */
export function useBills() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert, hasRate } = useFx();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11

    const [billRes, statusRes] = await Promise.all([
      supabase.from('bills').select('id, name, amount, currency, due_day, is_need').eq('user_id', user.id).eq('is_active', true),
      supabase.from('bill_statuses').select('bill_id, is_paid').eq('user_id', user.id).eq('month', month).eq('year', year),
    ]);

    const paidByBill = {};
    (statusRes.data || []).forEach((s) => { paidByBill[s.bill_id] = s.is_paid; });

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bills = (billRes.data || []).map((b, i) => ({
      id: b.id,
      name: b.name,
      amount: convert(Number(b.amount || 0), b.currency || settings.currency, settings.currency),
      isNeed: !!b.is_need,
      day: Math.min(Math.max(1, b.due_day || 1), daysInMonth),
      paid: !!paidByBill[b.id],
      color: PALETTE[i % PALETTE.length],
    }));

    setData({
      year, month,
      monthName: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now),
      daysInMonth,
      firstWeekday: new Date(year, month, 1).getDay(),
      today: now.getDate(),
      bills,
    });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, convert, settings.currency]);

  useEffect(() => { load(); }, [load, tick]);

  // Marking a bill paid records a real expense (so balances move) and links it
  // on the bill_status. Guarded so paying twice can't double-charge.
  const markPaid = useCallback(async (bill, accountId) => {
    if (!user || !data) return;
    const today = toLocalISODate();

    const { data: existing } = await supabase
      .from('bill_statuses')
      .select('id, is_paid, expense_id')
      .eq('user_id', user.id).eq('bill_id', bill.id).eq('month', data.month).eq('year', data.year)
      .maybeSingle();
    if (existing?.is_paid && existing?.expense_id) { await load(); return; }

    // Record the payment as an expense on the chosen account (or the primary one).
    let acctId = accountId;
    let acctCurrency = null;
    if (acctId) {
      const { data: acct } = await supabase
        .from('accounts').select('id, currency').eq('id', acctId).maybeSingle();
      acctCurrency = acct?.currency || null;
    } else {
      const { data: acct } = await supabase
        .from('accounts').select('id, currency').eq('user_id', user.id).eq('is_active', true)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      acctId = acct?.id || null;
      acctCurrency = acct?.currency || null;
    }
    // Expense amounts are denominated in their ACCOUNT's currency; the bill
    // amount lives in the display currency — convert so the ledger moves by the
    // real payment size (a $50 bill from a KES account posts ~KSh 6,450, not 50).
    const displayCur = settings.currency;
    const postAmount = Math.round(convert(bill.amount, displayCur, acctCurrency || displayCur) * 100) / 100;
    const { data: exp } = await supabase
      .from('expenses')
      .insert({ user_id: user.id, amount: postAmount, category: BILL_CATEGORY, account_id: acctId, date: today, note: `Bill: ${bill.name}`, amount_usd: toUsd(postAmount, acctCurrency || displayCur, { convert, hasRate }) })
      .select('id').maybeSingle();

    const fields = { is_paid: true, paid_amount: bill.amount, paid_date: today, expense_id: exp?.id || null };
    if (existing) await supabase.from('bill_statuses').update(fields).eq('id', existing.id);
    else await supabase.from('bill_statuses').insert({ user_id: user.id, bill_id: bill.id, month: data.month, year: data.year, ...fields });
    await load();
  }, [user, data, load, settings.currency, convert, hasRate]);

  return { data, loading, error, reload: load, markPaid };
}

