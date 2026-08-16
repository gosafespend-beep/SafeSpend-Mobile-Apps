import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';

export function useRecurring() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const { data } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('next_due', { ascending: true });
      setRows((data || []).map((r) => ({
        id: r.id, type: r.type, amount: Number(r.amount || 0), category: r.category || r.description || '—',
        description: r.description || '', frequency: r.frequency, nextDue: r.next_due, isActive: r.is_active,
        accountId: r.account_id,
      })));
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load, tick]);

  return { rows, loading, error, reload: load, empty: rows.length === 0 };
}
