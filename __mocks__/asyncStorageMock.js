// In-memory AsyncStorage stub for unit tests.
const store = new Map();
module.exports = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => { store.set(k, v); },
  removeItem: async (k) => { store.delete(k); },
  multiGet: async (keys) => keys.map((k) => [k, store.has(k) ? store.get(k) : null]),
  multiSet: async (pairs) => { pairs.forEach(([k, v]) => store.set(k, v)); },
};
