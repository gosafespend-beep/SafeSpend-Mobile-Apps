import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useEntitlement } from '../contexts/EntitlementContext';

function initialsFrom(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || src[0]?.toUpperCase() || '?';
}

export function useProfileInfo() {
  const { user } = useAuth();
  const { settings } = useSettings();
  // Plan comes from the single entitlement source of truth — no separate fetch,
  // so the profile badge can never disagree with the paywall / gating.
  const { planLabel } = useEntitlement();

  const meta = user?.user_metadata || {};
  const metaName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim();
  const [name, setName] = useState(metaName || (user?.email ? user.email.split('@')[0] : ''));
  const [avatarUrl, setAvatarUrl] = useState(meta.avatar_url || null);
  const email = user?.email || '';

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle();
    if (data?.display_name) setName(data.display_name);
    if (data?.avatar_url) setAvatarUrl(data.avatar_url);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  return {
    name: name || 'Your account',
    email,
    initials: initialsFrom(name, email),
    avatarUrl,
    plan: planLabel,
    currency: settings.currency,
    reload,
  };
}
