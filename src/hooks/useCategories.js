import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { normalizeIcon } from '../lib/icons';
import { toLocalISODate } from '../lib/date';

function monthStart() {
  const d = new Date();
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * Expense + income categories, each with this month's transaction count.
 * Expense counts match expenses.category (name); income counts match incomes.source.
 */
export function useCategories() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const [data, setData] = useState({ expense: [], income: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    const start = monthStart();
    const [exCatRes, inCatRes, expRes, incRes] = await Promise.all([
      supabase.from('categories').select('id, name, icon, color, is_need').eq('user_id', user.id).order('name'),
      supabase.from('income_categories').select('id, name, icon, color').eq('user_id', user.id).order('name'),
      supabase.from('expenses').select('category').eq('user_id', user.id).gte('date', start),
      supabase.from('incomes').select('source').eq('user_id', user.id).gte('date', start),
    ]);

    const expCount = {};
    (expRes.data || []).forEach((e) => { const k = e.category || 'Uncategorized'; expCount[k] = (expCount[k] || 0) + 1; });
    const incCount = {};
    (incRes.data || []).forEach((i) => { const k = i.source || 'Income'; incCount[k] = (incCount[k] || 0) + 1; });

    const mapWith = (rows, counts) =>
      (rows || []).map((cat) => ({
        id: cat.id, name: cat.name, icon: normalizeIcon(cat.icon), color: cat.color || '168 76% 42%',
        isNeed: !!cat.is_need, count: counts[cat.name] || 0,
      }));

    // A failed query used to fall through to mapWith(null) => [], i.e. an empty
    // category list indistinguishable from "this user has no categories". That
    // is what made BudgetSheet insist every category was already budgeted.
    const failure = exCatRes.error || inCatRes.error;
    if (failure) setError(failure);
    else setData({ expense: mapWith(exCatRes.data, expCount), income: mapWith(inCatRes.data, incCount) });
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
