import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';

function priorityFor(apr) {
  if (apr >= 20) return 'high';
  if (apr >= 8) return 'medium';
  return 'low';
}

export function useDebts(method = 'avalanche') {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
    const { data } = await supabase
      .from('debts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    setRows(
      (data || []).map((d) => ({
        // Debts carry their own currency (NOT NULL DEFAULT 'USD'); totals below sum
        // across rows, so convert into the display currency first.
        id: d.id, name: d.name, apr: Number(d.interest_rate || 0), currency: d.currency || settings.currency,
        min: convert(Number(d.minimum_payment || 0), d.currency || settings.currency, settings.currency),
        current: convert(Number(d.current_balance || 0), d.currency || settings.currency, settings.currency),
        starting: convert(Number(d.starting_balance || d.current_balance || 0), d.currency || settings.currency, settings.currency),
        priority: priorityFor(Number(d.interest_rate || 0)),
      }))
    );
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, convert, settings.currency]);

  useEffect(() => { load(); }, [load, tick]);

  const ordered = useMemo(
    () => [...rows].sort((a, b) => (method === 'avalanche' ? b.apr - a.apr : a.current - b.current)),
    [rows, method]
  );
  const total = rows.reduce((s, d) => s + d.current, 0);
  const totalStart = rows.reduce((s, d) => s + d.starting, 0);

  return { ordered, total, totalStart, paid: totalStart - total, loading, error, reload: load, empty: rows.length === 0 };
}
