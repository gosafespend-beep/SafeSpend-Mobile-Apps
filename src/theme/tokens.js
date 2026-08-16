/* Safe Spend — design tokens.
   Ported from the Claude Design handoff (colors_and_type.css / components.jsx).
   Supports light + dark themes: emerald accent + money-color semantics on either
   deep blue-black or clean white surfaces. Currency uses JetBrains Mono. */

import { Easing } from 'react-native';

/* ── Motion ──────────────────────────────────────────────────
   One source of truth for durations + easings so animations feel like one
   system. Functional motion stays short (100–250ms); celebrations up to ~700ms.
   Spring configs are Animated.spring-shaped ({friction,tension}). */
export const motion = {
  duration: { fast: 120, base: 220, slow: 420, celebrate: 700 },
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1), // most UI moves
    decelerate: Easing.out(Easing.cubic),  // things arriving (count-ups, fills)
    accelerate: Easing.in(Easing.cubic),   // things leaving
  },
  spring: { friction: 8, tension: 140 },     // default settle
  springKnob: { friction: 7, tension: 130 }, // toggles / small controls
  springBouncy: { friction: 5, tension: 160 }, // press-back, pulses
};

/* ── Raw HSL token triplets ("H S% L%") per theme ──────────────── */
const TOK_DARK = {
  primary:          '168 76% 42%', // brand emerald
  income:           '158 64% 45%', // money in (green)
  expense:          '350 70% 55%', // money out (rose-red)
  savings:          '45 93% 47%',  // savings (amber)
  warning:          '38 92% 50%',  // bills / caution (orange)
  bg:               '222 32% 6%',  // page background
  surface:          '222 28% 10%', // card
  surfaceHover:     '222 26% 13%',
  surfaceElevated:  '222 24% 15%', // modal / sheet
  surfaceSecondary: '222 24% 14%',
  surfaceMuted:     '222 22% 16%',
  input:            '222 24% 13%',
  fg:               '210 40% 98%', // primary text
  fgMuted:          '215 20% 50%', // secondary text
  border:           '222 20% 16%',
  borderSubtle:     '222 20% 12%',
};

const TOK_LIGHT = {
  primary:          '168 74% 38%', // emerald, darkened for white-bg contrast
  income:           '158 64% 38%',
  expense:          '350 68% 50%',
  savings:          '38 92% 42%',
  warning:          '32 90% 45%',
  bg:               '210 40% 98%', // page background (near-white)
  surface:          '0 0% 100%',   // card (white)
  surfaceHover:     '210 40% 95%',
  surfaceElevated:  '0 0% 100%',   // modal / sheet
  surfaceSecondary: '210 38% 96%',
  surfaceMuted:     '210 36% 93%',
  input:            '210 38% 97%',
  fg:               '222 34% 12%', // primary text (near-black)
  fgMuted:          '215 16% 42%', // secondary text
  border:           '214 22% 88%',
  borderSubtle:     '214 22% 92%',
};

/* Active palette — a single mutable object so `c()`/`hsl()` (called at render)
   always read the current theme. Screens re-render on theme change (see
   SettingsContext) and pick up the swapped values. */
export const TOK = { ...TOK_DARK };
let ACTIVE_THEME = 'dark';

export function applyThemeMode(mode) {
  ACTIVE_THEME = mode === 'light' ? 'light' : 'dark';
  Object.assign(TOK, ACTIVE_THEME === 'light' ? TOK_LIGHT : TOK_DARK);
  return ACTIVE_THEME;
}

export function currentThemeMode() { return ACTIVE_THEME; }

/* Extra accent hues used by a handful of category/icon swatches in the kit */
export const ACCENT = {
  purple: '#a78bfa',
  blue:   '#60a5fa',
  yellow: '#facc15',
};

// Neutral fallback used when a color value is missing or malformed (e.g. legacy
// category colors stored in a format we can't parse) — avoids "hsl(NaN,…)".
const FALLBACK_HSL = [215, 16, 47];

function parseTriplet(t) {
  const p = String(t).trim().split(/\s+/);
  const h = parseFloat(p[0]), s = parseFloat(p[1]), l = parseFloat(p[2]);
  if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l)) return FALLBACK_HSL;
  return [h, s, l];
}

/* token name → RN-valid color. `c('primary')` or `c('primary', 0.2)` */
export function c(key, a) {
  const [h, s, l] = parseTriplet(TOK[key] || key);
  return a === undefined ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/* raw triplet string → color. For category colors like '262 52% 56%'.
   Hex values (e.g. '#22c55e') are passed through; alpha on hex falls back to alpha(). */
export function hsl(t, a) {
  if (typeof t === 'string' && t[0] === '#') return a === undefined ? t : alpha(t, a);
  const [h, s, l] = parseTriplet(t);
  return a === undefined ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/* Universal alpha helper — accepts hex, hsl()/hsla() strings, or "H S% L%". */
export function alpha(color, a) {
  if (!color) return 'transparent';
  if (color[0] === '#') {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
    if (hex.length === 8) hex = hex.slice(0, 6);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (color.startsWith('hsl')) {
    const n = color.match(/[\d.]+/g) || [0, 0, 0];
    return `hsla(${n[0]}, ${n[1]}%, ${n[2]}%, ${a})`;
  }
  return hsl(color, a); // assume triplet
}

/* ── Type ────────────────────────────────────────────────────
   Inter for UI/display, JetBrains Mono for all numerics. Each weight is its
   own family (loaded via @expo-google-fonts) — reference by name, not weight. */
export const ff = {
  light: 'Inter_300Light',
  reg:   'Inter_400Regular',
  med:   'Inter_500Medium',
  semi:  'Inter_600SemiBold',
  bold:  'Inter_700Bold',
  monoReg:  'JetBrainsMono_400Regular',
  mono:     'JetBrainsMono_500Medium',
  monoSemi: 'JetBrainsMono_600SemiBold',
  monoBold: 'JetBrainsMono_700Bold',
};

/* tabular-nums money style. `num(700)` → bold mono with aligned figures. */
export function num(weight = 600) {
  const fam = weight >= 700 ? ff.monoBold : weight >= 600 ? ff.monoSemi : weight >= 500 ? ff.mono : ff.monoReg;
  return { fontFamily: fam, fontVariant: ['tabular-nums'] };
}

/* ── Radii (px) ─────────────────────────────────────────────── */
export const R = { sm: 7, input: 11, card: 14, lg: 18, pill: 9999 };

/* ── Shadows ────────────────────────────────────────────────── */
export function shadow(level = 1) {
  // black-only resting depth
  const map = {
    1: { o: 0.15, h: 1, r: 2, e: 1 },
    2: { o: 0.25, h: 6, r: 14, e: 6 },
    3: { o: 0.5, h: 12, r: 28, e: 14 },
  }[level] || { o: 0.15, h: 1, r: 2, e: 1 };
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: map.h },
    shadowOpacity: map.o,
    shadowRadius: map.r,
    elevation: map.e,
  };
}

/* primary-tinted glow (FAB, premium hover) */
export function glow(color = c('primary'), strength = 0.45) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: strength,
    shadowRadius: 18,
    elevation: 10,
  };
}
