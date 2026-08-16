import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { normalizeIcon } from '../lib/icons';

function monthsUntil(deadline) {
  if (!deadline) return null;
  const now = new Date();
  const d = new Date(deadline);
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return months > 0 ? months : null;
}

export function useGoals() {
  const { user } = useAuth();
  const { tick } = useRefresh();
  const { settings } = useSettings();
  const { convert } = useFx();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
    const { data: rows } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const goals = (rows || []).map((g) => {
      // Each row is denominated in its own currency (NOT NULL DEFAULT 'USD'),
      // so convert into the display currency before anything sums or compares.
      const gc = g.currency || settings.currency;
      const current = convert(Number(g.current_amount || 0), gc, settings.currency);
      const target = convert(Number(g.target_amount || 0), gc, settings.currency);
      const done = g.is_completed || (target > 0 && current >= target);
      const months = monthsUntil(g.deadline);
      const perMo = !done && months ? Math.ceil((target - current) / months) : null;
      return {
        id: g.id, name: g.name, icon: normalizeIcon(g.icon, 'target'), color: g.color || '168 76% 42%',
        current, target, done, currency: gc,
        deadline: g.deadline ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(g.deadline)) : null,
        rawDeadline: g.deadline || '',
        perMo,
      };
    });

    setData({
      goals,
      totalCurrent: goals.reduce((s, g) => s + g.current, 0),
      totalTarget: goals.reduce((s, g) => s + g.target, 0),
    });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [user, convert, settings.currency]);

  useEffect(() => { load(); }, [load, tick]);

  return { data, loading, error, reload: load };
}
