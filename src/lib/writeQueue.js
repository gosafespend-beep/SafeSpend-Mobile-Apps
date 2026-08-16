import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Offline write queue. When a Supabase insert fails because the device is
 * offline, we stash the row(s) locally and replay them when connectivity
 * returns (app foreground, or after any successful write). Pairs with the
 * read-cache (lib/cache.js) so the app is usable end-to-end without a network.
 *
 * Scope: inserts only (the common offline action — logging a transaction).
 * Queue entries: { id, table, rows: [...] }.
 */
const keyFor = (userId) => `write-queue:${userId}`;

/** True when an error looks like a lost-connection failure (vs a real 4xx/5xx). */
export function isNetworkError(e) {
  const msg = String(e?.message || e || '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    e?.name === 'TypeError' // RN throws TypeError on fetch when offline
  );
}

async function readQueue(userId) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueueRaw(userId, queue) {
  try { await AsyncStorage.setItem(keyFor(userId), JSON.stringify(queue)); } catch { /* noop */ }
}

/** Add an insert to the queue. `rows` is a single row object or an array. */
export async function enqueueInsert(userId, table, rows) {
  if (!userId) return;
  const queue = await readQueue(userId);
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, table, rows: Array.isArray(rows) ? rows : [rows] });
  await writeQueueRaw(userId, queue);
}

export async function pendingCount(userId) {
  if (!userId) return 0;
  return (await readQueue(userId)).length;
}

// Concurrency guard: flush is triggered from several places (sign-in effect,
// every AppState→active, post-save). Two overlapping flushes would both read
// the queue before either clears it and insert the SAME rows twice — duplicate
// transactions. One in-flight flush at a time; latecomers no-op.
let flushing = false;

/**
 * Replay queued inserts oldest-first. Stops at the first network failure and
 * keeps the rest queued. Returns the number of entries successfully synced.
 */
export async function flushQueue(userId) {
  if (!userId || flushing) return 0;
  flushing = true;
  try {
    return await flushQueueInner(userId);
  } finally {
    flushing = false;
  }
}

async function flushQueueInner(userId) {
  let queue = await readQueue(userId);
  if (!queue.length) return 0;
  let synced = 0;
  const remaining = [];
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    try {
      const { error } = await supabase.from(entry.table).insert(entry.rows);
      if (error) {
        // A real server rejection (not offline) — drop it so it can't wedge the
        // queue forever; better to lose one bad row than block every later sync.
        if (isNetworkError(error)) { remaining.push(...queue.slice(i)); break; }
        // else: drop this entry (skip) and continue
      } else {
        synced += 1;
      }
    } catch (e) {
      if (isNetworkError(e)) { remaining.push(...queue.slice(i)); break; }
      // non-network throw → drop entry
    }
  }
  await writeQueueRaw(userId, remaining);
  return synced;
}
