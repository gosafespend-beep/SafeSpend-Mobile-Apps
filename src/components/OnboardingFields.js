import React, { useMemo } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { c, ff, num, alpha } from '../theme/tokens';
import { Icon } from './index';
import { haptics } from '../lib/haptics';

/**
 * The input vocabulary for onboarding — mobile.
 *
 * Mirrors the web app's fields.tsx. A twenty-screen flow only works if the
 * screens are worth arriving at, so the rule throughout is the same: never just
 * capture a value, show what it did. Nothing here is a labelled number box,
 * because that is the shape that makes twenty screens feel like twenty forms.
 *
 * Every selection taps a haptic. On a phone that is most of the difference
 * between a flow that feels responsive and one that feels like a web page.
 */

/* ------------------------------------------------------------------ amount */

export function AmountField({ value, onChange, symbol, reflection, autoFocus }) {
  const display = useMemo(() => {
    if (!value) return '';
    const [whole, decimals] = value.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimals !== undefined ? `${grouped}.${decimals}` : grouped;
  }, [value]);

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
        <Text style={[num(600), { fontSize: 24, color: c('fgMuted'), marginRight: 4 }]}>{symbol}</Text>
        <TextInput
          autoFocus={autoFocus}
          value={display}
          onChangeText={(t) => {
            // Grouping is presentation; keep the stored value clean.
            const raw = t.replace(/,/g, '');
            if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) onChange(raw);
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={alpha(c('fgMuted'), 0.4)}
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="Amount"
          style={[num(700), {
            fontSize: 44, letterSpacing: -1, color: c('fg'),
            minWidth: 80, textAlign: 'center', padding: 0,
          }]}
        />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), marginTop: 12, textAlign: 'center', minHeight: 18 }}>
        {reflection || ''}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------------- day */

/**
 * A month as a grid.
 *
 * Typing "28" into a box is the least interesting way to ask this and invites
 * a typo that silently breaks the projection. Tapping a day is faster and looks
 * like the calendar the answer is about.
 */
export function DayField({ value, onChange, reflection }) {
  const today = new Date().getDate();
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const selected = value === day;
          return (
            <Pressable
              key={day}
              onPress={() => { haptics.tap(); onChange(day); }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Day ${day}`}
              style={{
                width: 44, height: 44, borderRadius: 11,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: selected ? c('primary') : c('surfaceSecondary'),
                borderWidth: !selected && day === today ? 1 : 0,
                borderColor: c('border'),
              }}
            >
              <Text maxFontSizeMultiplier={1.2} style={[num(selected ? 700 : 500), {
                fontSize: 14, color: selected ? '#fff' : c('fg'),
              }]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), marginTop: 14, textAlign: 'center', minHeight: 18 }}>
        {reflection || ''}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ choice */

export function ChoiceField({ options, value, onChange }) {
  return (
    <View style={{ gap: 8 }}>
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => { haptics.tap(); onChange(opt.id); }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15,
              borderRadius: 13, borderWidth: 2,
              borderColor: selected ? c('primary') : c('border'),
              backgroundColor: selected ? alpha(c('primary'), 0.07) : c('surface'),
            }}
          >
            {opt.icon ? (
              <View style={{
                width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                backgroundColor: opt.tone ? alpha(`hsl(${opt.tone})`, 0.18) : alpha(c('primary'), 0.18),
              }}>
                <Icon name={opt.icon} size={18} color={opt.tone ? `hsl(${opt.tone})` : c('primary')} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{opt.label}</Text>
              {opt.hint ? (
                <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{opt.hint}</Text>
              ) : null}
            </View>
            {selected ? <Icon name="check" size={18} color={c('primary')} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------- multi */

export function MultiField({ options, values, onToggle, reflection }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {options.map((opt) => {
          const selected = values.includes(opt.id);
          return (
            <Pressable
              key={opt.id}
              onPress={() => { haptics.tap(); onToggle(opt.id); }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 14, paddingVertical: 9, minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 2,
                borderColor: selected ? c('primary') : c('border'),
                backgroundColor: selected ? alpha(c('primary'), 0.1) : 'transparent',
              }}
            >
              <Text maxFontSizeMultiplier={1.2} style={{
                fontSize: 13,
                fontFamily: selected ? ff.semi : ff.reg,
                color: selected ? c('fg') : c('fgMuted'),
              }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: c('fgMuted'), marginTop: 14, textAlign: 'center', minHeight: 18 }}>
        {reflection || ''}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------- name */

/**
 * A short label, answered by tapping or typing.
 *
 * Naming a bill and naming a first expense were the last two screens still
 * rendering a bordered text box, which next to a 31-cell calendar and a 40pt
 * figure reads as the form the rest of the flow was written to avoid — and they
 * land at the two moments that matter most, the first commitment and the last
 * screen.
 *
 * The chips do most of the work, and they earn their place on a phone more than
 * on web: almost every answer here is one of six words, and tapping one beats
 * typing it on a touch keyboard every time.
 */
export function NameField({ value, onChange, placeholder, suggestions = [], autoFocus }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={alpha(c('fgMuted'), 0.5)}
        autoFocus={autoFocus}
        maxFontSizeMultiplier={1.2}
        accessibilityLabel={placeholder}
        style={[num(600), {
          fontSize: 26,
          color: c('fg'),
          textAlign: 'center',
          alignSelf: 'stretch',
          paddingVertical: 8,
          borderBottomWidth: 2,
          borderBottomColor: value ? alpha(c('primary'), 0.6) : c('border'),
        }]}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 }}>
        {suggestions.map((s) => {
          const selected = value.toLowerCase() === s.toLowerCase();
          return (
            <Pressable
              key={s}
              // Tapping the chosen chip again clears it rather than being inert,
              // and typing over one stops it looking chosen.
              onPress={() => { haptics.tap(); onChange(selected ? '' : s); }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 2,
                borderColor: selected ? c('primary') : c('border'),
                backgroundColor: selected ? alpha(c('primary'), 0.1) : 'transparent',
              }}
            >
              <Text maxFontSizeMultiplier={1.2} style={{
                fontSize: 13,
                fontFamily: selected ? ff.semi : ff.reg,
                color: selected ? c('fg') : c('fgMuted'),
              }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------- fork */

/**
 * Yes / no as two equal cards.
 *
 * A fork should look like a fork. Rendering "no" as a small skip link biases
 * the answer, and a biased answer here seeds a bill that does not exist.
 */
export function ForkField({ value, onChange, yesLabel = 'Yes', noLabel = 'Not right now' }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {[{ v: true, label: yesLabel }, { v: false, label: noLabel }].map((opt) => {
        const selected = value === opt.v;
        return (
          <Pressable
            key={String(opt.v)}
            onPress={() => { haptics.tap(); onChange(opt.v); }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              flex: 1, paddingVertical: 20, borderRadius: 13, borderWidth: 2, alignItems: 'center',
              borderColor: selected ? c('primary') : c('border'),
              backgroundColor: selected ? alpha(c('primary'), 0.07) : c('surface'),
            }}
          >
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
