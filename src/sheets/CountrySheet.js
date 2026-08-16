import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { c, ff, shadow } from '../theme/tokens';
import { Input, Icon } from '../components';
import { COUNTRIES, flagEmoji } from '../lib/countries';

/** Searchable country picker. `onSelect(code)` sets the region; `current` is the ISO-2 in use. */
export default function CountrySheet({ open, current, onSelect, onClose, bottomInset = 0 }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? COUNTRIES.filter((x) => x.name.toLowerCase().includes(s) || x.code.toLowerCase().includes(s)) : COUNTRIES;
  }, [q]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <View style={{ backgroundColor: c('surfaceElevated'), borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 22 + bottomInset, maxHeight: '85%', ...shadow(3) }}>
          <View style={{ width: 38, height: 4, borderRadius: 9999, backgroundColor: c('fgMuted'), opacity: 0.4, alignSelf: 'center', marginTop: 4, marginBottom: 10 }} />
          <Text style={{ fontSize: 18, fontFamily: ff.bold, color: c('fg'), marginBottom: 12 }}>Select your country</Text>
          <Input leading="search" placeholder="Search countries…" value={q} onChange={setQ} />
          <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {filtered.map((ct) => {
              const active = current === ct.code;
              return (
                <Pressable
                  key={ct.code}
                  onPress={() => { onSelect(ct.code); onClose(); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 11, backgroundColor: active ? c('primary', 0.1) : 'transparent' }, pressed && { backgroundColor: c('surfaceHover') }]}
                >
                  <Text style={{ fontSize: 22 }}>{flagEmoji(ct.code)}</Text>
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: ff.med, color: c('fg') }}>{ct.name}</Text>
                  {active ? <Icon name="check" size={16} color={c('primary')} stroke={2.5} /> : null}
                </Pressable>
              );
            })}
            {filtered.length === 0 ? (
              <Text style={{ textAlign: 'center', color: c('fgMuted'), paddingVertical: 20 }}>No match. Your region still works with manual entry.</Text>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
