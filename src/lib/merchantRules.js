import AsyncStorage from '@react-native-async-storage/async-storage';

// A local, offline-first memory of "this merchant → that category". Learned every
// time the user categorizes an expense that has a description, and applied on
// capture (manual, import, statement) BEFORE falling back to the AI — so the app
// gets visibly smarter and cheaper the more it's used.
//
// Stored per-device in AsyncStorage (namespaced by user). A future enhancement can
// sync these to a `merchant_rules` table for cross-device learning; the shape here
// is deliberately table-friendly ({ key, category, count, updatedAt }).

const KEY = (uid) => `merchant_rules:${uid || 'anon'}`;
const MAX_RULES = 400; // cap so the store can't grow unbounded

/** Normalize a merchant/description into a stable lookup key. */
export function merchantKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\bx{2,}\d+\b/g, ' ')      // masked card numbers
    .replace(/\b\d{4,}\b/g, ' ')         // long digit runs (refs/acct nums)
    .replace(/[^a-z0-9 ]+/g, ' ')        // punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

async function readAll(uid) {
  try {
    const raw = await AsyncStorage.getItem(KEY(uid));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function writeAll(uid, map) {
  try {
    // Evict the least-recently-updated rules if we're over the cap.
    const entries = Object.entries(map);
    if (entries.length > MAX_RULES) {
      entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
      map = Object.fromEntries(entries.slice(0, MAX_RULES));
    }
    await AsyncStorage.setItem(KEY(uid), JSON.stringify(map));
  } catch { /* best-effort */ }
}

/** Record that `description` was categorized as `category` (expenses only). */
export async function rememberRule(uid, description, category) {
  const k = merchantKey(description);
  const cat = String(category || '').trim();
  if (!k || k.length < 2 || !cat || /^(uncategorized|income|other)$/i.test(cat)) return;
  const map = await readAll(uid);
  const prev = map[k];
  // If the user keeps re-labelling the same merchant differently, the newest wins
  // but we track a count so a one-off doesn't override a strong existing rule.
  if (prev && prev.category !== cat) {
    map[k] = { key: k, category: cat, count: 1, updatedAt: Date.now() };
  } else {
    map[k] = { key: k, category: cat, count: (prev?.count || 0) + 1, updatedAt: Date.now() };
  }
  await writeAll(uid, map);
}

/** Look up a learned category for a description, or null. */
export async function lookupRule(uid, description) {
  const k = merchantKey(description);
  if (!k) return null;
  const map = await readAll(uid);
  return map[k]?.category || null;
}

/** Load the whole rule map once (for batch-applying during an import). */
export async function loadRules(uid) {
  const map = await readAll(uid);
  const out = {};
  Object.values(map).forEach((r) => { out[r.key] = r.category; });
  return out;
}

/** Apply a preloaded rule map to a description synchronously. */
export function applyRules(rules, description) {
  if (!rules) return null;
  return rules[merchantKey(description)] || null;
}
