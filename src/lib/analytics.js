import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Lightweight, backend-agnostic product analytics — the onboarding funnel (and
// anything else) becomes measurable without a third-party SDK. Events are always
// recorded locally and flushed best-effort to a Supabase `analytics_events`
// table; until that table exists they simply stay buffered, so wiring events now
// is safe and starts producing data the moment the table is created.
//
// Required backend (one-time, coordinate with the web agent):
//   create table analytics_events (
//     id bigint generated always as identity primary key,
//     event text not null,
//     props jsonb default '{}',
//     user_id uuid,
//     session_id text,
//     platform text,
//     created_at timestamptz default now()
//   );
//   alter table analytics_events enable row level security;
//   create policy "insert own/anon" on analytics_events for insert
//     with check (user_id is null or user_id = auth.uid());

const BUFFER_KEY = 'analytics_buffer';
const MAX_BUFFER = 500;

// Groups one app run's events. Random-enough; not security-sensitive.
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let flushing = false;

async function readBuffer() {
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeBuffer(rows) {
  try {
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(rows.slice(-MAX_BUFFER)));
  } catch {
    /* out of space — drop silently, analytics is never critical */
  }
}

async function insertRows(rows) {
  const { error } = await supabase.from('analytics_events').insert(rows);
  return !error;
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getSession(); // local read, no network
    return data?.session?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget event. Never throws, never blocks the UI. Safe to call
 * pre-auth (user_id is simply null).
 */
export function track(event, props = {}) {
  (async () => {
    const row = {
      event,
      props,
      user_id: await currentUserId(),
      session_id: SESSION_ID,
      platform: Platform.OS,
      created_at: new Date().toISOString(),
    };
    const ok = await insertRows([row]).catch(() => false);
    if (!ok) {
      const buf = await readBuffer();
      buf.push(row);
      await writeBuffer(buf);
    }
  })();
}

/** Drain buffered events. Call on app start and on foreground. */
export async function flushAnalytics() {
  if (flushing) return;
  flushing = true;
  try {
    const buf = await readBuffer();
    if (buf.length && (await insertRows(buf).catch(() => false))) {
      await writeBuffer([]);
    }
  } finally {
    flushing = false;
  }
}
