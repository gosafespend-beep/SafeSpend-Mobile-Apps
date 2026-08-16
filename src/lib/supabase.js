import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';
import { createClient } from '@supabase/supabase-js';

// Public anon/publishable values — safe to embed (identical to the web app's
// src/integrations/supabase/client.ts). RLS enforces all access control.
const SUPABASE_URL = 'https://qeogqvjqvafbzufanwki.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlb2dxdmpxdmFmYnp1ZmFud2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTAwNDksImV4cCI6MjA4NTE4NjA0OX0.H84dCTVcdwBcmliqWDhfRK9cHMfAWSae1EfNj-oAyF8';

/**
 * LargeSecureStore: encrypts the (large) Supabase session with a per-key AES-256
 * key kept in the device keystore/keychain (expo-secure-store), storing only the
 * ciphertext in AsyncStorage. Avoids SecureStore's ~2KB value cap while keeping
 * auth tokens encrypted at rest. Pattern from the Supabase Expo docs.
 */
class LargeSecureStore {
  async _encrypt(key, value) {
    const encryptionKey = Crypto.getRandomBytes(32);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  async _decrypt(key, value) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this._decrypt(key, encrypted);
    } catch {
      return null;
    }
  }

  async setItem(key, value) {
    await AsyncStorage.setItem(key, await this._encrypt(key, value));
  }

  async removeItem(key) {
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
