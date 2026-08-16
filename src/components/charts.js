import React, { useRef, useEffect } from 'react';
import { View, Text, Dimensions, Pressable, Animated } from 'react-native';
import Svg, { Rect, Path, Circle, Line as SvgLine } from 'react-native-svg';
import { c, ff, num, motion } from '../theme/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAnimatedProgress } from './motion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const screenW = Dimensions.get('window').width;
const CHART_W = screenW - 28 - 32; // screen − screen padding − card padding

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// Shared 0→1 "reveal" driver, snapping when reduce-motion is on. Re-runs when
// `dep` changes so charts re-animate on new data. SVG props can't use the native
// driver, so these are JS-driven (fine for short one-shot reveals).
function useChartReveal(dep, duration = motion.duration.slow) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(1); return undefined; }
    anim.setValue(0);
    const a = Animated.timing(anim, { toValue: 1, duration, easing: motion.easing.decelerate, useNativeDriver: false });
    a.start();
    return () => a.stop && a.stop();
  }, [dep, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return anim;
}

/** Grouped vertical bars: data = [{ label, income, expense }]. Bars grow up. */
export function GroupedBars({ data = [], height = 160 }) {
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.income || 0, d.expense || 0])));
  const w = CHART_W;
  const groupW = w / Math.max(1, data.length);
  const barW = Math.min(14, groupW / 3);
  const grow = useChartReveal(data.length + ':' + max);
  return (
    <View>
      <Svg width={w} height={height}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <SvgLine key={g} x1={0} y1={height - g * height} x2={w} y2={height - g * height} stroke={c('border')} strokeWidth={0.5} opacity={0.5} />
        ))}
        {data.map((d, i) => {
          const cx = i * groupW + groupW / 2;
          const ih = ((d.income || 0) / max) * (height - 4);
          const eh = ((d.expense || 0) / max) * (height - 4);
          const iy = grow.interpolate({ inputRange: [0, 1], outputRange: [height, height - ih] });
          const ihA = grow.interpolate({ inputRange: [0, 1], outputRange: [0, ih] });
          const ey = grow.interpolate({ inputRange: [0, 1], outputRange: [height, height - eh] });
          const ehA = grow.interpolate({ inputRange: [0, 1], outputRange: [0, eh] });
          return (
            <React.Fragment key={i}>
              <AnimatedRect x={cx - barW - 1} y={iy} width={barW} height={ihA} rx={3} fill={c('income')} />
              <AnimatedRect x={cx + 1} y={ey} width={barW} height={ehA} rx={3} fill={c('expense')} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        {data.map((d, i) => (
          <Text key={i} style={{ width: groupW, textAlign: 'center', fontSize: 9, color: c('fgMuted'), marginTop: 4 }}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

/** Single-series line chart: data = [{ label, value }]. The line draws on, and
 *  tapping the chart pins the nearest point with a value tooltip + guide line. */
export function LineChart({ data = [], height = 150, color = c('primary'), format }) {
  const w = CHART_W;
  const [active, setActive] = React.useState(null); // index of the inspected point
  const vals = data.map((d) => d.value || 0);
  const min = Math.min(0, ...vals);
  const max = niceMax(Math.max(1, ...vals));
  const span = max - min || 1;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => ({ x: i * stepX, y: height - 8 - ((d.value - min) / span) * (height - 16), v: d.value || 0, label: d.label }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  // Approximate path length so strokeDashoffset can sweep the line into view.
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  pathLen = Math.max(1, pathLen);
  const reveal = useChartReveal(line);
  const dashOffset = reveal.interpolate({ inputRange: [0, 1], outputRange: [pathLen, 0] });

  const fmt = format || ((v) => String(Math.round(v)));
  const pick = (e) => {
    const lx = e.nativeEvent.locationX;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(lx / stepX)));
    setActive((cur) => (cur === i ? null : i));
  };
  const ap = active != null ? pts[active] : null;
  const tipW = 96;
  const tipLeft = ap ? Math.max(0, Math.min(w - tipW, ap.x - tipW / 2)) : 0;

  return (
    <View>
      {format ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <Text style={{ fontSize: 10, color: c('fgMuted') }}>{`Peak ${format(max)}`}</Text>
          {last ? <Text style={[num(600), { fontSize: 12, color }]}>{`Now ${format(last.v)}`}</Text> : null}
        </View>
      ) : null}
      <Pressable onPress={pick} accessibilityLabel="Chart — tap a point to inspect its value">
        <Svg width={w} height={height}>
          {[0.5, 1].map((g) => (
            <SvgLine key={g} x1={0} y1={height - g * (height - 16) - 8} x2={w} y2={height - g * (height - 16) - 8} stroke={c('border')} strokeWidth={0.5} opacity={0.4} />
          ))}
          <Path d={`${line} L${w},${height} L0,${height} Z`} fill={color} opacity={0.12} />
          <AnimatedPath d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={pathLen} strokeDashoffset={dashOffset} />
          {ap ? <SvgLine x1={ap.x} y1={0} x2={ap.x} y2={height} stroke={color} strokeWidth={1} opacity={0.35} strokeDasharray="3 3" /> : null}
          {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />)}
          {format && last ? <Circle cx={last.x} cy={last.y} r={4} fill={color} stroke={c('surface')} strokeWidth={1.5} /> : null}
          {ap ? <Circle cx={ap.x} cy={ap.y} r={5} fill={color} stroke={c('surface')} strokeWidth={2} /> : null}
        </Svg>
        {ap ? (
          <View style={{ position: 'absolute', top: Math.max(0, ap.y - 44), left: tipLeft, width: tipW, alignItems: 'center', backgroundColor: c('surfaceElevated'), borderWidth: 1, borderColor: c('border'), borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6 }}>
            <Text style={[num(700), { fontSize: 12, color: c('fg') }]} numberOfLines={1}>{fmt(ap.v)}</Text>
            <Text style={{ fontSize: 9, color: c('fgMuted') }}>{ap.label}</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {data.map((d, i) => (
          <Text key={i} style={{ fontSize: 9, color: active === i ? color : c('fgMuted'), fontFamily: active === i ? ff.semi : ff.reg, marginTop: 4 }}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

/** Faint, non-interactive preview shown where a real chart has no data yet — a
 *  premium "here's what will appear" ghost instead of a flat grey line of text. */
export function ChartGhost({ height = 120, message = 'Not enough data yet.' }) {
  const w = CHART_W;
  const ghost = 'M0,90 C40,80 70,86 110,64 C150,42 180,58 220,40 C260,24 290,34 330,20';
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
      <Svg width={w} height={height} viewBox="0 0 330 110" preserveAspectRatio="none" style={{ opacity: 0.28 }}>
        <Path d={`${ghost} L330,110 L0,110 Z`} fill={c('fgMuted')} opacity={0.15} />
        <Path d={ghost} stroke={c('fgMuted')} strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray="5 6" />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 12, color: c('fgMuted'), textAlign: 'center', paddingHorizontal: 20 }}>{message}</Text>
    </View>
  );
}

/** One horizontal bar row — its own component so the fill can animate per-row. */
function HBarRow({ d, max, format, onPress }) {
  const pct = Math.max(2, (d.value / max) * 100);
  const anim = useAnimatedProgress(pct);
  const width = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  const Row = (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: c('fg') }} numberOfLines={1}>{d.label}</Text>
        <Text style={[num(600), { fontSize: 12, color: c('fg') }]}>{format(d.value)}</Text>
      </View>
      <View style={{ height: 7, borderRadius: 9999, backgroundColor: c('surfaceSecondary'), overflow: 'hidden' }}>
        <Animated.View style={{ width, height: '100%', borderRadius: 9999, backgroundColor: d.color || c('primary') }} />
      </View>
    </View>
  );
  return onPress
    ? <Pressable onPress={() => onPress(d)} style={({ pressed }) => pressed && { opacity: 0.6 }}>{Row}</Pressable>
    : <View>{Row}</View>;
}

/** Horizontal bars: data = [{ label, value, color }], with a formatter. Optional onPress(item). */
export function HBars({ data = [], format = (v) => String(v), onPress }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <View style={{ gap: 10 }}>
      {data.map((d, i) => <HBarRow key={i} d={d} max={max} format={format} onPress={onPress} />)}
    </View>
  );
}
