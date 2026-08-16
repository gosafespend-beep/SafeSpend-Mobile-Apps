import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useSessions(active) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await supabase.functions.invoke('list-sessions');
      if (e || data?.error) setError(e?.message || data?.error || 'Could not load sessions');
      else setSessions(data?.sessions || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (active) load(); }, [active, load]);

  const revoke = useCallback(async (sessionId) => {
    const { data, error: e } = await supabase.functions.invoke('revoke-session', { body: { session_id: sessionId } });
    if (e || data?.error) return { ok: false, error: e?.message || data?.error };
    await load();
    return { ok: true };
  }, [load]);

  return { sessions, loading, error, reload: load, revoke };
}
