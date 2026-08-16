import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, ff, alpha, R } from '../theme/tokens';
import { Icon } from '../components';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import { useSettings } from '../contexts/SettingsContext';
import { useRegion } from '../contexts/RegionContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { useGoals } from '../hooks/useGoals';
import { useDebts } from '../hooks/useDebts';
import { buildCoachContext, COACH_SUGGESTIONS } from '../lib/coachContext';

// Shown when the coach can't be reached yet — the edge function isn't deployed,
// Gemini is unconfigured, or the network dropped. Kept warm and non-alarming.
const WARMING = 'Your coach is warming up — this feature is being switched on. Please try again in a bit.';

/** One chat bubble. Coach on the left (surface), user on the right (primary). */
function Bubble({ role, text, soft }) {
  const isUser = role === 'user';
  return (
    <View style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <View
        style={{
          maxWidth: '86%',
          backgroundColor: isUser ? c('primary') : c('surface'),
          borderWidth: isUser ? 0 : 1,
          borderColor: c('border'),
          borderRadius: 16,
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontSize: 14.5, lineHeight: 21, color: isUser ? '#fff' : (soft ? c('fgMuted') : c('fg')) }}>{text}</Text>
      </View>
    </View>
  );
}

/** Premium gate — the coach is a Premium feature. */
function CoachLocked({ onUpgrade }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }}>
      <View style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: c('primary', 0.14), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sparkles" size={30} color={c('primary')} />
      </View>
      <Text style={{ fontSize: 20, fontFamily: ff.bold, color: c('fg'), textAlign: 'center' }}>Meet your AI money coach</Text>
      <Text style={{ fontSize: 14, lineHeight: 21, color: c('fgMuted'), textAlign: 'center', maxWidth: 320 }}>
        Ask anything about your money — “Can I afford this?”, “Where did it go?”, “How do I hit my goal faster?” — and get answers grounded in your own numbers.
      </Text>
      <Pressable
        onPress={onUpgrade}
        accessibilityRole="button"
        style={({ pressed }) => [{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 24, borderRadius: R.pill, backgroundColor: c('primary') }, pressed && { opacity: 0.9 }]}
      >
        <Icon name="sparkles" size={17} color="#fff" />
        <Text style={{ fontSize: 15, fontFamily: ff.semi, color: '#fff' }}>Unlock the coach</Text>
      </Pressable>
    </View>
  );
}

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { country } = useRegion();
  const { isPremium, presentPaywall } = useEntitlement();
  const { data: dash } = useDashboardData();
  const { data: goalData } = useGoals();
  const { ordered: debts } = useDebts();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { track('coach_open'); }, []);

  // Keep the newest message in view as the conversation grows / coach "thinks".
  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const ask = useCallback(async (raw) => {
    const question = String(raw || '').trim();
    if (!question || busy) return;
    haptics.impact();
    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: question }]);
    setBusy(true);
    track('coach_message', { len: question.length });
    const context = buildCoachContext(dash, {
      currency: settings.currency,
      country,
      goals: goalData?.goals || [],
      debts: debts || [],
    });
    // Send recent turns so the coach can handle follow-ups ("what about last
    // month?") — bounded to the last 6 messages to keep the request small.
    const history = messages.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'coach', text: String(m.text || '').slice(0, 400) }));
    let reply;
    try {
      const { data: res, error } = await supabase.functions.invoke('ai-coach', { body: { question, context, history } });
      if (error) throw error;
      if (res?.answer) reply = { role: 'coach', text: res.answer };
      else if (res?.error === 'premium_required') reply = { role: 'coach', text: 'The AI coach is a Premium feature. Unlock it to start chatting.', cta: true };
      else reply = { role: 'coach', text: WARMING, soft: true };
    } catch {
      reply = { role: 'coach', text: WARMING, soft: true };
    }
    setMessages((m) => [...m, { id: `c${Date.now()}`, ...reply }]);
    setBusy(false);
  }, [busy, dash, settings.currency, country, goalData, debts, messages]);

  if (!isPremium) return <CoachLocked onUpgrade={() => presentPaywall('coach')} />;

  const empty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 52}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
      >
        {empty ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 14, paddingVertical: 24 }}>
            <View style={{ alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c('primary', 0.14), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="sparkles" size={26} color={c('primary')} />
              </View>
              <Text style={{ fontSize: 17, fontFamily: ff.semi, color: c('fg') }}>Ask your money coach</Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: c('fgMuted'), textAlign: 'center', maxWidth: 300 }}>
                Grounded in your real numbers. Try one of these to start:
              </Text>
            </View>
            {COACH_SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => ask(s)}
                accessibilityRole="button"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderRadius: R.card, borderWidth: 1, borderColor: c('border'), backgroundColor: pressed ? c('surfaceHover') : c('surface') }]}
              >
                <Icon name="messageCircle" size={17} color={c('primary')} />
                <Text style={{ flex: 1, fontSize: 14, color: c('fg') }}>{s}</Text>
                <Icon name="chevronRight" size={15} color={c('fgMuted')} />
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            {messages.map((m) => (
              <View key={m.id}>
                <Bubble role={m.role} text={m.text} soft={m.soft} />
                {m.cta ? (
                  <Pressable
                    onPress={() => presentPaywall('coach')}
                    style={({ pressed }) => [{ alignSelf: 'flex-start', marginTop: -2, marginBottom: 10, paddingVertical: 9, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: c('primary') }, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={{ fontSize: 13, fontFamily: ff.semi, color: '#fff' }}>Unlock the coach</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={c('primary')} />
                  <Text style={{ fontSize: 13, color: c('fgMuted') }}>Thinking…</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={{ borderTopWidth: 1, borderTopColor: c('border'), backgroundColor: c('bg'), paddingHorizontal: 12, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your money…"
            placeholderTextColor={c('fgMuted')}
            multiline
            style={{ flex: 1, maxHeight: 120, minHeight: 44, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 14.5, color: c('fg'), backgroundColor: c('input'), borderWidth: 1, borderColor: c('border'), borderRadius: 22 }}
            onSubmitEditing={() => ask(input)}
            returnKeyType="send"
            editable={!busy}
          />
          <Pressable
            onPress={() => ask(input)}
            disabled={busy || !input.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: input.trim() && !busy ? c('primary') : c('surfaceMuted'), alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevronUp" size={20} color={input.trim() && !busy ? '#fff' : c('fgMuted')} stroke={2.4} />
          </Pressable>
        </View>
        <Text style={{ fontSize: 10.5, color: c('fgMuted'), textAlign: 'center', marginTop: 7 }}>
          Coach can make mistakes · not licensed financial advice
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
