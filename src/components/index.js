import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, TextInput, Image, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient as SvgLG, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Icon from './Icon';
import { c, hsl, alpha, ff, num, R, shadow, glow, motion, TOK } from '../theme/tokens';
import { useAnimatedProgress, AnimatedNumber } from './motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

const tapHaptic = () => Haptics.selectionAsync().catch(() => {});
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Spring press-scale for tactile buttons. Returns { scale, onPressIn, onPressOut }. */
function usePressScale(to = 0.97) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => { if (!reduced) Animated.spring(scale, { toValue: to, ...motion.springBouncy, useNativeDriver: true }).start(); };
  const onPressOut = () => { if (!reduced) Animated.spring(scale, { toValue: 1, ...motion.springBouncy, useNativeDriver: true }).start(); };
  return { scale, onPressIn, onPressOut };
}

export { Icon };

const logo = require('../../assets/logo-shield.png');

/* ── HEADER ─────────────────────────────────────────────────── */
export function Header({ title = 'Safe Spend', showLogo = true, onBack, right, topInset = 0, onProfile, onBell, bellCount = 0 }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 10, height: 56 + topInset, backgroundColor: c('surface', 0.97), borderBottomColor: c('border', 0.6) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back" style={styles.headerBtn}>
            <Icon name="chevronLeft" size={22} color={c('fg')} />
          </Pressable>
        ) : showLogo ? (
          <View style={styles.logoWrap}>
            <Image source={logo} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
        ) : null}
        <Text style={{ fontFamily: ff.semi, fontSize: 16, letterSpacing: -0.16, color: c('fg') }} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right || (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onBell ? (
            <Pressable
              onPress={onBell}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={bellCount > 0 ? `${bellCount} items need attention` : 'Nothing needs attention'}
              style={({ pressed }) => [styles.headerAvatar, { backgroundColor: pressed ? c('surfaceHover') : c('surfaceSecondary'), borderColor: c('border', 0.5) }]}
            >
              <Icon name="bell" size={19} color={c('fgMuted')} />
              {bellCount > 0 ? (
                <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 8, height: 8, borderRadius: 9999, backgroundColor: c('expense'), borderWidth: 1.5, borderColor: c('surface') }} />
              ) : null}
            </Pressable>
          ) : null}
          <Pressable
            onPress={onProfile}
            disabled={!onProfile}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Profile and settings"
            style={({ pressed }) => [styles.headerAvatar, { backgroundColor: pressed ? c('surfaceHover') : c('surfaceSecondary'), borderColor: c('border', 0.5) }]}
          >
            <Icon name="userCircle" size={20} color={c('fgMuted')} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ── BOTTOM TAB BAR ─────────────────────────────────────────── */
export const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'log', label: 'Log', icon: 'arrowUpDown' },
  { id: 'budget', label: 'Budget', icon: 'calendar' },
  { id: 'reports', label: 'Reports', icon: 'barChart' },
  { id: 'more', label: 'More', icon: 'menu' },
];

export function TabBar({ active, onChange, bottomInset = 0 }) {
  const reduced = useReducedMotion();
  const [rowW, setRowW] = useState(0);
  const idx = Math.max(0, TABS.findIndex((t) => t.id === active));
  const anim = useRef(new Animated.Value(idx)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(idx); return undefined; }
    const a = Animated.spring(anim, { toValue: idx, ...motion.spring, useNativeDriver: true });
    a.start();
    return () => a.stop && a.stop();
  }, [idx, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const slotW = rowW / TABS.length;
  const PILL_W = 32;
  const translateX = slotW > 0
    ? anim.interpolate({ inputRange: TABS.map((_, i) => i), outputRange: TABS.map((_, i) => i * slotW + slotW / 2 - PILL_W / 2) })
    : 0;
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(bottomInset, 10), backgroundColor: c('surface', 0.98), borderTopColor: c('border', 0.6) }]}>
      <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {slotW > 0 ? <Animated.View style={[styles.tabPill, { left: 0, backgroundColor: c('primary'), transform: [{ translateX }] }]} /> : null}
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <Pressable key={t.id} onPress={() => { tapHaptic(); onChange(t.id); }} accessibilityRole="tab" accessibilityState={{ selected: isActive }} accessibilityLabel={t.label} style={styles.tab}>
              <View style={[styles.tabIcon, isActive && { backgroundColor: c('primary', 0.15) }]}>
                <Icon name={t.icon} size={20} color={isActive ? c('primary') : c('fgMuted')} />
              </View>
              <Text style={{ fontSize: 10, fontFamily: ff.med, color: isActive ? c('primary') : c('fgMuted') }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ── FAB ────────────────────────────────────────────────────── */
export function Fab({ onPress, onLongPress, bottom = 92 }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress && onPress(); }}
      onLongPress={onLongPress ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); onLongPress(); } : undefined}
      delayLongPress={320}
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      accessibilityHint={onLongPress ? 'Long-press to repeat your last transaction' : undefined}
      style={({ pressed }) => [styles.fab, { bottom, backgroundColor: c('primary') }, glow(c('primary'), 0.45), pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <Icon name="plus" size={24} stroke={2.4} color="#fff" />
    </Pressable>
  );
}

/* ── STAT CARD ──────────────────────────────────────────────── */
export function StatCard({ label, value, amount, format = (n) => String(n), variant = 'default', subtitle, delta, onPress }) {
  const palette = {
    default: { hsl: TOK.fgMuted, valueColor: c('fg') },
    income: { hsl: TOK.income, valueColor: c('income') },
    expense: { hsl: TOK.expense, valueColor: c('expense') },
    balance: { hsl: TOK.primary, valueColor: c('primary') },
  }[variant];
  const iconName = { default: 'scale', income: 'trendingUp', expense: 'trendingDown', balance: 'wallet' }[variant];
  const isDefault = variant === 'default';
  const border = isDefault ? c('border') : hsl(palette.hsl, 0.2);

  const Inner = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.kicker, { color: c('fgMuted') }]}>{label}</Text>
        <View style={[styles.statIcon, { backgroundColor: hsl(palette.hsl, 0.2) }]}>
          <Icon name={iconName} size={16} color={hsl(palette.hsl)} />
        </View>
      </View>
      {amount != null ? (
        <AnimatedNumber value={amount} format={format} maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[num(700), { fontSize: 20, letterSpacing: -0.2, color: palette.valueColor }]} />
      ) : (
        <Text maxFontSizeMultiplier={1.4} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[num(700), { fontSize: 20, letterSpacing: -0.2, color: palette.valueColor }]}>{value}</Text>
      )}
      {(subtitle || delta) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
          {subtitle ? <Text style={{ fontSize: 10, color: c('fgMuted'), fontFamily: ff.med }}>{subtitle}</Text> : <View />}
          {delta ? (
            <Text style={[num(600), { fontSize: 10, color: delta.startsWith('+') ? c('income') : c('expense') }]}>{delta}</Text>
          ) : null}
        </View>
      )}
    </>
  );

  // The View/Pressable container is shared so the tappable and static cards match.
  const Container = onPress ? Pressable : View;
  const pressProps = onPress
    ? { onPress, accessibilityRole: 'button', accessibilityLabel: `${label}, ${value}`, style: ({ pressed }) => [styles.statCard, isDefault ? { backgroundColor: c('surface') } : null, { borderColor: border }, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }] }
    : { style: [styles.statCard, isDefault ? { backgroundColor: c('surface') } : null, { borderColor: border }] };

  return (
    <Container {...pressProps}>
      {!isDefault ? (
        <LinearGradient
          colors={[hsl(palette.hsl, 0.1), hsl(palette.hsl, 0.05), 'transparent']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {Inner}
    </Container>
  );
}

/* ── CARD ───────────────────────────────────────────────────── */
export function Card({ children, style, title, action, padded = true }) {
  return (
    <View style={[styles.card, { backgroundColor: c('surface'), borderColor: c('border') }, style]}>
      {title ? (
        <View style={styles.cardHead}>
          <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>{title}</Text>
          {action}
        </View>
      ) : null}
      <View style={{ padding: padded ? (title ? 0 : 14) : 0, paddingHorizontal: padded && title ? 16 : undefined, paddingBottom: padded && title ? 14 : undefined }}>
        {children}
      </View>
    </View>
  );
}

/* ── LIST ROW ───────────────────────────────────────────────── */
export function ListRow({ icon, iconColor, title, subtitle, right, rightSub, accent, onPress, last }) {
  const bg = accent === 'income' ? c('income', 0.1) : accent === 'expense' ? c('expense', 0.1) : 'transparent';
  const amtColor = accent === 'income' ? c('income') : accent === 'expense' ? c('expense') : c('fg');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: bg, borderBottomColor: c('border', 0.5), borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        pressed && onPress && { backgroundColor: c('surfaceHover') },
      ]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: iconColor ? alpha(iconColor, 0.15) : c('surfaceSecondary') }]}>
          <Icon name={icon} size={18} color={iconColor || c('fg')} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {(right || rightSub) && (
        <View style={{ alignItems: 'flex-end' }}>
          {right ? <Text style={[num(600), { fontSize: 14, color: amtColor }]}>{right}</Text> : null}
          {rightSub ? <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{rightSub}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

/* ── PROGRESS BAR ───────────────────────────────────────────── */
export function ProgressBar({ value, color = c('primary'), height = 6 }) {
  const w = Math.max(0, Math.min(100, value || 0));
  const anim = useAnimatedProgress(w);
  const width = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  return (
    <View style={{ height, backgroundColor: c('surfaceMuted'), borderRadius: R.pill, overflow: 'hidden' }}>
      <Animated.View style={{ width, height: '100%', backgroundColor: color, borderRadius: R.pill }} />
    </View>
  );
}

/* ── RING PROGRESS ──────────────────────────────────────────── */
export function RingProgress({ percentage, size = 56, strokeWidth = 5, color, trackColor, children }) {
  const r = (size - strokeWidth) / 2;
  const circ = r * 2 * Math.PI;
  const w = Math.max(0, Math.min(100, percentage || 0));
  const cx = size / 2;
  const anim = useAnimatedProgress(w);
  // 0% → fully offset (empty ring); 100% → offset 0 (full ring). Animated sweep.
  const off = anim.interpolate({ inputRange: [0, 100], outputRange: [circ, 0], extrapolate: 'clamp' });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor || c('surfaceMuted')} strokeWidth={strokeWidth} />
        <AnimatedCircle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color || c('primary')}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      {children ? <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>{children}</View> : null}
    </View>
  );
}

/* ── DONUT (conic-gradient replacement) ─────────────────────── */
function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function wedge(cx, cy, r, start, end) {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
}
export function Donut({ segments, size = 120, hole = 0.55, center }) {
  const cx = size / 2;
  const r = size / 2;
  let acc = 0;
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(1); return undefined; }
    const a = Animated.timing(anim, { toValue: 1, duration: motion.duration.slow, easing: motion.easing.decelerate, useNativeDriver: true });
    a.start();
    return () => a.stop && a.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }}>
      <Svg width={size} height={size}>
        {segments.map((s, i) => {
          const start = acc * 360;
          acc += s.share;
          const end = acc * 360;
          return <Path key={i} d={wedge(cx, cx, r, start, Math.min(end, 359.999))} fill={hsl(s.color)} />;
        })}
        <Circle cx={cx} cy={cx} r={r * hole} fill={c('surface')} />
      </Svg>
      {center ? <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>{center}</View> : null}
    </Animated.View>
  );
}

/* ── NET-WORTH SPARKLINE ────────────────────────────────────── */
export function Sparkline({ width = 300, height = 80, color = c('primary'), data }) {
  const defaultLine =
    'M0,60 C20,55 40,50 60,48 C80,46 100,40 120,42 C140,44 160,30 180,28 C200,26 220,32 240,22 C260,12 280,16 300,10';
  let line = defaultLine;
  if (Array.isArray(data) && data.length >= 2) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const stepX = 300 / (data.length - 1);
    line = data
      .map((v, i) => {
        const x = i * stepX;
        const y = 72 - ((v - min) / span) * 64; // padded 8..72
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
  const area = `${line} L300,80 L0,80 Z`;
  const reduced = useReducedMotion();
  const draw = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { draw.setValue(1); return undefined; }
    draw.setValue(0);
    const a = Animated.timing(draw, { toValue: 1, duration: motion.duration.slow, easing: motion.easing.decelerate, useNativeDriver: false });
    a.start();
    return () => a.stop && a.stop();
  }, [line, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const DASH = 900; // generous — covers the wiggly path within the 0..300 viewBox
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [DASH, 0] });
  return (
    <Svg width="100%" height={height} viewBox="0 0 300 80" preserveAspectRatio="none">
      <Defs>
        <SvgLG id="nwGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </SvgLG>
      </Defs>
      <Path d={area} fill="url(#nwGrad)" />
      <AnimatedPath d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={DASH} strokeDashoffset={dashOffset} />
    </Svg>
  );
}

/* ── BADGE ──────────────────────────────────────────────────── */
export function Badge({ children, variant = 'default', icon }) {
  const palette = {
    default: { bg: c('surfaceSecondary'), fg: c('fg'), border: c('border') },
    income: { bg: c('income', 0.2), fg: c('income'), border: c('income', 0.3) },
    expense: { bg: c('expense', 0.15), fg: c('expense'), border: c('expense', 0.3) },
    warning: { bg: c('warning', 0.15), fg: c('warning'), border: c('warning', 0.3) },
    primary: { bg: c('primary', 0.18), fg: c('primary'), border: c('primary', 0.3) },
  }[variant];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {icon ? <Icon name={icon} size={11} stroke={2.4} color={palette.fg} /> : null}
      <Text style={{ fontSize: 11, fontFamily: ff.semi, color: palette.fg }}>{children}</Text>
    </View>
  );
}

/* ── BUTTON ─────────────────────────────────────────────────── */
export function Button({ children, variant = 'primary', size = 'md', icon, onPress, style, disabled, block }) {
  const palette = {
    primary: { bg: c('primary'), color: '#fff', border: 'transparent' },
    outline: { bg: 'transparent', color: c('fg'), border: c('border') },
    secondary: { bg: c('surfaceSecondary'), color: c('fg'), border: 'transparent' },
    ghost: { bg: 'transparent', color: c('fg'), border: 'transparent' },
    destructive: { bg: c('expense'), color: '#fff', border: 'transparent' },
  }[variant];
  const sz = {
    sm: { h: 36, px: 12, r: 9, fs: 13 },
    md: { h: 44, px: 16, r: 11, fs: 14 },
    lg: { h: 50, px: 22, r: 12, fs: 15 },
  }[size];
  const textColor = (style && style.color) || palette.color;
  const { scale, onPressIn, onPressOut } = usePressScale(0.97);
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: sz.h,
          paddingHorizontal: sz.px,
          borderRadius: sz.r,
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
          alignSelf: block ? 'stretch' : 'flex-start',
          transform: [{ scale }],
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={textColor} /> : null}
      {typeof children === 'string' ? <Text style={{ fontFamily: ff.med, fontSize: sz.fs, color: textColor }}>{children}</Text> : children}
    </AnimatedPressable>
  );
}

/* ── INPUT ──────────────────────────────────────────────────── */
export function Input({ label, placeholder, value, onChange, secure, leading, prefix, error, keyboardType, autoCapitalize, autoComplete, textContentType, autoCorrect }) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const borderColor = error ? c('expense') : focused ? c('primary') : c('border');
  // Input hygiene: email fields must NOT auto-capitalize/autocorrect (a top cause of
  // "invalid credentials" from a mangled address) and secure fields should offer
  // password-manager autofill. Explicit props override these defaults.
  const isEmail = keyboardType === 'email-address';
  const cap = autoCapitalize ?? (isEmail || secure ? 'none' : 'sentences');
  const corr = autoCorrect ?? !(isEmail || secure);
  const complete = autoComplete ?? (isEmail ? 'email' : secure ? 'password' : undefined);
  const contentType = textContentType ?? (isEmail ? 'emailAddress' : secure ? 'password' : undefined);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('fg') }}>{label}</Text> : null}
      <View style={{ justifyContent: 'center' }}>
        {prefix ? (
          <Text style={[num(400), { position: 'absolute', left: 14, zIndex: 1, color: c('fgMuted'), fontSize: 14 }]}>{prefix}</Text>
        ) : null}
        {leading ? (
          <View style={{ position: 'absolute', left: 12, zIndex: 1 }}>
            <Icon name={leading} size={16} color={c('fgMuted')} />
          </View>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c('fgMuted')}
          secureTextEntry={secure && !reveal}
          keyboardType={keyboardType}
          autoCapitalize={cap}
          autoCorrect={corr}
          autoComplete={complete}
          textContentType={contentType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            height: 44,
            paddingLeft: leading ? 38 : prefix ? 26 : 14,
            paddingRight: secure ? 44 : 14,
            backgroundColor: c('input'),
            borderWidth: 1,
            borderColor,
            borderRadius: R.input,
            color: c('fg'),
            fontSize: 14,
            fontFamily: prefix ? ff.mono : ff.reg,
          }}
        />
        {secure ? (
          <Pressable
            onPress={() => setReveal((r) => !r)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 4, height: 44, width: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} color={c('fgMuted')} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={{ fontSize: 12, color: c('expense') }}>{error}</Text> : null}
    </View>
  );
}

/* ── SECTION HEADER ─────────────────────────────────────────── */
export function SectionHeader({ title, action }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 14, paddingBottom: 8 }}>
      <Text style={[styles.kicker, { color: c('fgMuted') }]}>{title}</Text>
      {action}
    </View>
  );
}

/* ── PERIOD PILL ────────────────────────────────────────────── */
export function PeriodPill({ value, onPrev, onNext }) {
  // Show a chevron only when it actually navigates; otherwise a spacer keeps centering.
  return (
    <View style={[styles.periodPill, { backgroundColor: c('surface'), borderColor: c('border') }]}>
      {onPrev ? (
        <Pressable onPress={onPrev} style={styles.periodBtn} hitSlop={6}><Icon name="chevronLeft" size={16} color={c('fg')} /></Pressable>
      ) : <View style={styles.periodBtn} />}
      <Text style={{ minWidth: 110, textAlign: 'center', fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>{value}</Text>
      {onNext ? (
        <Pressable onPress={onNext} style={styles.periodBtn} hitSlop={6}><Icon name="chevronRight" size={16} color={c('fg')} /></Pressable>
      ) : <View style={styles.periodBtn} />}
    </View>
  );
}

/* ── TOGGLE ─────────────────────────────────────────────────── */
export function Toggle({ on, onPress, label }) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(on ? 1 : 0); return undefined; }
    const a = Animated.spring(anim, { toValue: on ? 1 : 0, ...motion.springKnob, useNativeDriver: false });
    a.start();
    return () => a.stop && a.stop();
  }, [on, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const backgroundColor = anim.interpolate({ inputRange: [0, 1], outputRange: [c('surfaceMuted'), c('primary')] });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  return (
    <Pressable
      onPress={() => { tapHaptic(); onPress && onPress(); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!on }}
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Animated.View style={[styles.toggle, { backgroundColor }]}>
        <Animated.View style={[styles.toggleKnob, { transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

/* ── shared styles ──────────────────────────────────────────── */
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: c('surface', 0.97),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c('border', 0.6),
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  logoWrap: { width: 32, height: 32, borderRadius: 10, overflow: 'hidden' },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c('surfaceSecondary'), borderWidth: 1, borderColor: c('border', 0.5),
  },
  tabBar: {
    paddingTop: 8,
    backgroundColor: c('surface', 0.98),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c('border', 0.6),
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, position: 'relative' },
  // NOTE: no theme colors in this static sheet — StyleSheet.create runs once at
  // import (dark theme) and would go stale after a Light/Dark switch. Colors for
  // tabPill/fab/kicker are applied inline at render.
  tabPill: { position: 'absolute', top: 0, width: 32, height: 2, borderRadius: R.pill },
  tabIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute', right: 16, width: 52, height: 52, borderRadius: R.pill,
    alignItems: 'center', justifyContent: 'center', zIndex: 35,
  },
  statCard: { flex: 1, position: 'relative', padding: 14, borderWidth: 1, borderRadius: R.card, overflow: 'hidden', ...shadow(1) },
  kicker: { fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase' },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: R.card, ...shadow(1) },
  cardHead: { paddingTop: 14, paddingBottom: 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16,
    minHeight: 56, borderBottomColor: c('border', 0.5),
  },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: R.pill, borderWidth: 1, alignSelf: 'flex-start' },
  periodPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: R.pill, padding: 3 },
  periodBtn: { width: 32, height: 32, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 44, height: 26, borderRadius: R.pill, padding: 2, justifyContent: 'center' },
  toggleKnob: { width: 22, height: 22, borderRadius: R.pill, backgroundColor: '#fff', ...shadow(1) },
});
