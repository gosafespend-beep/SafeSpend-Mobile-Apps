import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiny stale-while-revalidate read cache for data hooks.
 *
 * Hooks hydrate synchronously-ish from the last successful fetch (so the app
 * shows real numbers instantly on cold start / offline) and then refresh from
 * the network, writing back through on success.
 *
 * Keys are namespaced per user so switching accounts can't leak data across
 * sign-ins. Values are plain JSON — keep them small (summaries + first pages).
 */
const PREFIX = 'swr-cache';

const keyFor = (userId, key) => `${PREFIX}:${userId}:${key}`;

export async function cacheGet(userId, key) {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cacheSet(userId, key, data) {
  if (!userId || data === undefined) return;
  // Fire-and-forget — a failed cache write must never break the fetch path.
  try { AsyncStorage.setItem(keyFor(userId, key), JSON.stringify(data)).catch(() => {}); } catch { /* noop */ }
}
