import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, num, glow, alpha, hsl } from '../theme/tokens';
import { Input, Button, Icon } from '../components';
import { SUPPORTED_CURRENCIES } from '../lib/format';
import { guessCurrency } from '../lib/locale';
import { currencyForCountry } from '../lib/regions';
import { useRegion } from '../contexts/RegionContext';
import { track } from '../lib/analytics';

const logo = require('../../assets/logo-shield.png');

// Persisted so the app never shows this pre-auth flow twice, and so the
// answers can prefill the post-sign-up setup.
export const WELCOME_SEEN_KEY = 'pref_welcome_seen';
export const INTENT_KEY = 'pref_intent';
export const PRE_CURRENCY_KEY = 'pref_pre_currency';

const STEPS = ['Intro', 'Goal', 'Currency'];

const INTENTS = [
  { key: 'overspend', icon: 'shield', tone: '158 64% 45%', title: 'Stop overspending', body: 'Always know what’s safe to spend.' },
  { key: 'save', icon: 'piggy', tone: '262 52% 56%', title: 'Save for a goal', body: 'Build toward something specific.' },
  { key: 'debt', icon: 'scale', tone: '350 70% 55%', title: 'Pay off debt', body: 'Track balances and knock them down.' },
  { key: 'track', icon: 'barChart', tone: '200 70% 50%', title: 'Just track it all', body: 'See exactly where the money goes.' },
];

const VALUE_PROPS = [
  { icon: 'wallet', text: 'One number: what’s safe to spend today' },
  { icon: 'scale', text: 'Budgets, goals, debts and bills in one place' },
  { icon: 'barChart', text: 'Insights and a 6-month forecast' },
  { icon: 'shield', text: 'Private by design — your data stays yours' },
];

/**
 * Pre-auth welcome. Shows the value, captures intent + currency, then hands off
 * to sign-up — so the user meets the product before hitting an auth wall.
 * `onDone(mode)` advances the root gate to AuthScreen ('signup' | 'signin').
 */
export default function WelcomeScreen({ onDone, topInset = 0 }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  /*
   * Plural on purpose. People arrive with more than one reason -- paying off a
   * card AND trying to stop overspending is the normal case. Headspace found
   * that letting users pick several instead of forcing one lifted free trial
   * conversion by 10%, and forcing a single choice also throws away the second
   * answer, which the dashboard could have used.
   */
  const [intents, setIntents] = useState([]);
  const [currency, setCurrency] = useState(() => guessCurrency(SUPPORTED_CURRENCIES.map((x) => x.code)));
  const [search, setSearch] = useState('');
  // Region resolves asynchronously (and can come from a stored override, not just
  // the device locale), so re-derive the default once it lands — but never
  // overwrite a currency the user has already chosen themselves.
  const { country, loaded: regionLoaded } = useRegion();
  const currencyTouched = React.useRef(false);
  useEffect(() => {
    if (!regionLoaded || currencyTouched.current) return;
    const best = currencyForCountry(country, SUPPORTED_CURRENCIES.map((x) => x.code));
    if (best) setCurrency(best);
  }, [regionLoaded, country]);
  const chooseCurrency = (code) => { currencyTouched.current = true; setCurrency(code); };
  // The currency is already detected from the device region, so the default state
  // is a one-tap confirmation — the full 18-item list only appears if the guess is
  // wrong. Asking someone to scroll a settings list before they've seen any value
  // was pure friction.
  const [pickingCurrency, setPickingCurrency] = useState(false);

  useEffect(() => { track('welcome_start'); }, []);

  // Step events fire on ENTER (including the very first step) so per-step drop-off
  // is measurable. Firing on exit made "viewed and bailed" look identical to
  // "never got there".
  useEffect(() => { track('welcome_step', { step: STEPS[step], index: step }); }, [step]);

  const progress = ((step + 1) / STEPS.length) * 100;
  const selected = SUPPORTED_CURRENCIES.find((x) => x.code === currency) || SUPPORTED_CURRENCIES[0];
  const filtered = SUPPORTED_CURRENCIES.filter(
    (x) => !search || x.name.toLowerCase().includes(search.toLowerCase()) || x.code.toLowerCase().includes(search.toLowerCase()) || x.country.toLowerCase().includes(search.toLowerCase())
  );

  const finish = async (mode) => {
    try {
      await AsyncStorage.multiSet([
        [WELCOME_SEEN_KEY, 'true'],
        [PRE_CURRENCY_KEY, currency],
        // Comma-separated, matching web, so an older single-value key still reads.
        ...(intents.length ? [[INTENT_KEY, intents.join(',')]] : []),
      ]);
    } catch { /* best-effort; the gate still advances */ }
    track('welcome_complete', { intents: intents.join(','), count: intents.length, currency, mode });
    onDone && onDone(mode, { currency, intents });
  };

  // Continue only advances through the pre-auth steps; the final CTA is explicit.
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const name = STEPS[step];

  return (
    <View style={{ flex: 1, backgroundColor: c('bg'), paddingTop: topInset + 30, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
      <LinearGradient colors={[alpha(c('primary'), 0.14), 'transparent']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%' }} />

      {/* Progress */}
      <View style={{ marginBottom: 22 }}>
        <View style={{ height: 3, backgroundColor: c('surfaceSecondary'), borderRadius: 9999, overflow: 'hidden' }}>
          <View style={{ width: `${progress}%`, height: '100%', backgroundColor: c('primary') }} />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Step 0 — Intro / value */}
        {name === 'Intro' ? (
          <View style={{ alignItems: 'center' }}>
            <View style={[{ width: 84, height: 84, marginBottom: 18, borderRadius: 22, overflow: 'hidden' }, glow(c('primary'), 0.5)]}>
              <Image source={logo} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
            <Text style={{ fontSize: 26, fontFamily: ff.bold, letterSpacing: -0.4, color: c('fg'), textAlign: 'center' }}>Take control of your money</Text>
            <Text style={{ fontSize: 14, color: c('fgMuted'), marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 320 }}>SafeSpend turns your accounts, bills and goals into one clear answer — no spreadsheet required.</Text>
            <View style={{ marginTop: 24, gap: 12, alignSelf: 'stretch' }}>
              {VALUE_PROPS.map((v) => (
                <View key={v.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border') }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c('primary', 0.14), alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={v.icon} size={18} color={c('primary')} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: ff.med, color: c('fg') }}>{v.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Step 1 — Intent */}
        {name === 'Goal' ? (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 18 }}>
              <Text style={{ fontSize: 22, fontFamily: ff.bold, letterSpacing: -0.3, color: c('fg') }}>What brings you here?</Text>
              <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 6, textAlign: 'center' }}>We’ll tailor SafeSpend to what matters to you.</Text>
            </View>
            <View style={{ gap: 10 }}>
              {INTENTS.map((it) => {
                const active = intents.includes(it.key);
                return (
                  <Pressable key={it.key} onPress={() => setIntents((prev) => prev.includes(it.key) ? prev.filter((i) => i !== it.key) : [...prev, it.key])} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderRadius: 13, borderWidth: 2, borderColor: active ? c('primary') : c('border'), backgroundColor: active ? c('primary', 0.07) : c('surface') }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: alpha(hsl(it.tone), 0.16), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={it.icon} size={20} color={hsl(it.tone)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>{it.title}</Text>
                      <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{it.body}</Text>
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 9999, borderWidth: 2, borderColor: active ? c('primary') : c('fgMuted'), backgroundColor: active ? c('primary') : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {active ? <Icon name="check" size={12} color="#fff" stroke={2.5} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Step 2 — Currency: confirm the detected one, or open the picker */}
        {name === 'Currency' ? (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 10, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="wallet" size={20} color={c('primary')} />
              </View>
              <Text style={{ fontSize: 20, fontFamily: ff.bold, letterSpacing: -0.3, color: c('fg') }}>Your currency</Text>
              <Text style={{ fontSize: 13, color: c('fgMuted'), marginTop: 4, textAlign: 'center' }}>
                {pickingCurrency ? 'Pick the currency you use most.' : 'We picked this from your region — tap to change it.'}
              </Text>
            </View>

            {!pickingCurrency ? (
              <Pressable
                onPress={() => setPickingCurrency(true)}
                accessibilityRole="button"
                accessibilityLabel={`Currency ${selected?.code}. Tap to change`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 14, borderWidth: 2, borderColor: c('primary'), backgroundColor: c('primary', 0.08) }}
              >
                <Text style={[num(700), { fontSize: 30, width: 46, textAlign: 'center', color: c('primary') }]}>{selected?.symbol}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: ff.semi, color: c('fg') }}>{`${selected?.country} — ${selected?.code}`}</Text>
                  <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{selected?.name}</Text>
                </View>
                <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('primary') }}>Change</Text>
              </Pressable>
            ) : (
              <>
                <Input leading="search" placeholder="Search currencies…" value={search} onChange={setSearch} />
                <View style={{ marginTop: 12, gap: 8 }}>
                  {filtered.map((cur) => {
                    const active = currency === cur.code;
                    return (
                      <Pressable key={cur.code} onPress={() => { chooseCurrency(cur.code); setPickingCurrency(false); setSearch(''); }} style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 11, borderWidth: 2, borderColor: active ? c('primary') : c('border'), backgroundColor: active ? c('primary', 0.08) : c('surface'), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                          <Text style={[num(600), { fontSize: 18, width: 28, textAlign: 'center', color: c('fg') }]}>{cur.symbol}</Text>
                          <View>
                            <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('fg') }}>{`${cur.country} — ${cur.code}`}</Text>
                            <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{cur.name}</Text>
                          </View>
                        </View>
                        {active ? (
                          <View style={{ width: 20, height: 20, borderRadius: 9999, backgroundColor: c('primary'), alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="check" size={12} color="#fff" stroke={2.5} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Footer */}
      <View style={{ marginTop: 20, gap: 10 }}>
        {name === 'Currency' ? (
          <>
            <Button block size="lg" icon="sparkles" onPress={() => finish('signup')}>Create your account</Button>
            <Pressable onPress={() => finish('signin')} accessibilityRole="button" style={{ padding: 10, alignItems: 'center' }}>
              <Text style={{ color: c('fgMuted'), fontSize: 13, fontFamily: ff.med }}>I already have an account</Text>
            </Pressable>
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {step > 0 ? <View style={{ flex: 1 }}><Button block size="lg" variant="outline" onPress={() => setStep(step - 1)}>Back</Button></View> : null}
            <View style={{ flex: step > 0 ? 1.4 : 1 }}>
              <Button block size="lg" onPress={next} disabled={name === 'Goal' && intents.length === 0}>Continue</Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
