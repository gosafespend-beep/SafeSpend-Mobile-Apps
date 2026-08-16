import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const DEFAULTS = { bill_reminders: true, budget_alerts: true, weekly_summary: true, marketing_emails: false };

/** Loads + persists the four real notification_preferences columns. */
export function useNotificationPrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('bill_reminders, budget_alerts, weekly_summary, marketing_emails')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      if (data) setPrefs({ ...DEFAULTS, ...data });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  const toggle = useCallback(async (key) => {
    if (!user) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...next }, { onConflict: 'user_id' });
    if (error) setPrefs(prefs); // revert on failure
  }, [user, prefs]);

  return { prefs, loading, toggle };
}
