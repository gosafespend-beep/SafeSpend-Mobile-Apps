import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform, TextInput, Animated } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { c, ff, num, R, shadow } from '../theme/tokens';
import { Button, Icon } from './index';
import { useSheetDrag } from './useSheetDrag';
import { useEntitlement } from '../contexts/EntitlementContext';
import { toLocalISODate } from '../lib/date';

/**
 * Reusable bottom-sheet modal for create/edit forms. Keyboard-aware, safe-area
 * padded, with a draggable grabber, title, close button, scrollable body and a
 * sticky primary action. Matches the AddSheet look.
 */
export function FormSheet({ open, onClose, title, children, onSave, saving, saveLabel = 'Save', saveVariant = 'primary', bottomInset = 0, feature = 'edit' }) {
  const { translateY, panHandlers } = useSheetDrag(onClose);
  const { canWrite, presentPaywall } = useEntitlement();

  // Read-only wall: a non-subscriber never sees the create/edit form — opening it
  // bounces straight to the paywall. (Onboarding creates starter accounts via a
  // direct insert, not this sheet, so first-run setup is unaffected.)
  useEffect(() => {
    if (open && !canWrite) { onClose && onClose(); presentPaywall(feature); }
  }, [open, canWrite]); // eslint-disable-line react-hooks/exhaustive-deps
  if (open && !canWrite) return null;

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSave && onSave();
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <Animated.View style={{ transform: [{ translateY }], backgroundColor: c('surfaceElevated'), borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 22 + bottomInset, maxHeight: '90%', ...shadow(3) }}>
          {/* Handle + header are the drag-to-dismiss zone (content scrolls below). */}
          <View {...panHandlers}>
            <View style={{ width: 38, height: 4, borderRadius: 9999, backgroundColor: c('fgMuted'), opacity: 0.4, alignSelf: 'center', marginTop: 4, marginBottom: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 18, fontFamily: ff.bold, letterSpacing: -0.18, color: c('fg') }}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={18} color={c('fgMuted')} />
              </Pressable>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 14 }}>
            {children}
          </ScrollView>
          <Button block size="lg" variant={saveVariant} icon="check" onPress={handleSave} disabled={saving}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Labelled amount input with the user's currency symbol prefix style. */
export function AmountField({ value, onChange, label = 'Amount', symbol = '$' }) {
  return (
    <View>
      <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: c('input'), borderWidth: 1, borderColor: c('border'), borderRadius: R.input }}>
        <Text style={[num(500), { fontSize: 22, color: c('fgMuted') }]}>{symbol}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0.00"
          placeholderTextColor={c('fgMuted')}
          keyboardType="decimal-pad"
          style={[num(700), { flex: 1, fontSize: 24, color: c('fg'), padding: 0, letterSpacing: -0.24 }]}
        />
      </View>
    </View>
  );
}

/** Horizontal selectable color/icon swatch row. */
export function SwatchPicker({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: o.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: active ? '#fff' : 'transparent', opacity: active ? 1 : 0.65 }}>
            {o.icon ? <Icon name={o.icon} size={18} color="#fff" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Native date field. `value`/`onChange` use ISO 'YYYY-MM-DD' strings.
 * `optional` lets the user clear the date.
 */
export function DateField({ label, value, onChange, optional }) {
  const [show, setShow] = useState(false);
  const date = value ? new Date(value + 'T00:00:00') : new Date();
  const display = value
    ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
    : 'Select a date';
  return (
    <View>
      <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setShow(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 14, backgroundColor: c('input'), borderWidth: 1, borderColor: c('border'), borderRadius: R.input }}>
          <Icon name="calendar" size={16} color={c('fgMuted')} />
          <Text style={{ fontSize: 14, color: value ? c('fg') : c('fgMuted'), fontFamily: ff.reg }}>{display}</Text>
        </Pressable>
        {optional && value ? (
          <Pressable onPress={() => onChange('')} accessibilityLabel="Clear date" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: c('surfaceSecondary'), borderRadius: R.input }}>
            <Icon name="x" size={16} color={c('fgMuted')} />
          </Pressable>
        ) : null}
      </View>
      {show ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selected) => {
            setShow(Platform.OS === 'ios');
            if (event.type === 'dismissed') { setShow(false); return; }
            if (selected) onChange(toLocalISODate(selected));
            if (Platform.OS !== 'ios') setShow(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** Inline segmented choice (e.g. need/want, account type). */
export function SegmentField({ label, options, value, onChange }) {
  return (
    <View>
      {label ? <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c('surfaceSecondary'), borderRadius: 11 }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} style={[{ flex: 1, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, active && { backgroundColor: c('surface'), ...shadow(1) }]}>
              <Text style={{ fontSize: 13, fontFamily: ff.semi, color: active ? c('fg') : c('fgMuted') }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
