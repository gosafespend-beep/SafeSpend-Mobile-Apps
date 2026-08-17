import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { c, hsl, ff, num, shadow, alpha } from '../theme/tokens';
import { ProgressBar, RingProgress, Badge, SectionHeader, Icon, Toggle } from '../components';
import { Reveal } from '../components/motion';
import { money } from '../lib/format';
import { useBudget, autoBudgetFromHistory } from '../hooks/useBudget';
import { PeriodSelector } from '../components/PeriodSelector';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useFx } from '../contexts/FxContext';
import { haptics } from '../lib/haptics';
import BudgetSheet from '../sheets/BudgetSheet';

export default function BudgetScreen() {
  const { data, loading, error, reload } = useBudget();
  const { settings, setBudgetRollover } = useSettings();
  const { user } = useAuth();
  const { convert } = useFx();
  const [sheet, setSheet] = useState(null); // null | { editing }
  const [autoBusy, setAutoBusy] = useState(false);
  const m0 = (n) => money(n, { currency: settings.currency, cents: false });

  const runAutoBudget = () => {
    Alert.alert('Auto-budget from history', 'Set each category’s monthly limit to its average of the last 3 months. Existing limits will be updated.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Set budgets', onPress: async () => {
        setAutoBusy(true);
        try {
          const n = await autoBudgetFromHistory(user.id, convert, settings.currency);
          haptics.success();
          Alert.alert(n > 0 ? 'Budgets set' : 'Not enough history', n > 0 ? `Suggested limits for ${n} categor${n === 1 ? 'y' : 'ies'} from your recent spending.` : 'Log a few weeks of expenses first, then try again.');
          reload();
        } catch (e) { Alert.alert('Could not auto-budget', e.message); }
        setAutoBusy(false);
      } },
    ]);
  };

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { income, budgeted, remaining, cats, rolloverOn } = data;
  const allocPct = income > 0 ? (budgeted / income) * 100 : 0;
  const budgetedIds = cats.map((x) => x.id);
  // Zero-based state: aim to allocate every unit of income (remaining → 0).
  const allocState = remaining === 0 && income > 0 ? 'zero' : remaining > 0 ? 'under' : 'over';
  const allocTone = allocState === 'zero' ? c('income') : allocState === 'under' ? c('warning') : c('expense');
  const allocBadge = allocState === 'zero' ? 'Fully allocated' : allocState === 'under' ? `${m0(remaining)} to allocate` : `Over by ${m0(Math.abs(remaining))}`;

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      <PeriodSelector />
      {/* Income allocation header */}
      <View style={{ borderRadius: 14, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), padding: 16, ...shadow(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: c('primary', 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="wallet" size={18} color={c('primary')} />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fg') }}>Income to Allocate</Text>
              <Text style={{ fontSize: 11, color: c('fgMuted') }}>Monthly budget allocation</Text>
            </View>
          </View>
          <Badge variant={allocState === 'zero' ? 'income' : allocState === 'under' ? 'warning' : 'expense'} icon={allocState === 'zero' ? 'check' : undefined}>{allocBadge}</Badge>
        </View>
        <ProgressBar value={allocPct} color={c('primary')} height={8} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 8 }}>
          <View style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 9, backgroundColor: c('income', 0.1), borderWidth: 1, borderColor: c('income', 0.2) }}>
            <Text style={styles_kicker()}>Income</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={[num(700), { fontSize: 13, color: c('income') }]}>{m0(income)}</Text>
          </View>
          <Icon name="chevronRight" size={14} color={c('fgMuted')} />
          <View style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 9, backgroundColor: c('surfaceSecondary') }}>
            <Text style={styles_kicker()}>Budgeted</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={[num(700), { fontSize: 13, color: c('fg') }]}>{m0(budgeted)}</Text>
          </View>
          <Text style={{ fontSize: 18, color: c('fgMuted') }}>=</Text>
          <View style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 9, backgroundColor: alpha(allocTone, 0.1), borderWidth: 1, borderColor: alpha(allocTone, 0.2) }}>
            <Text style={styles_kicker()}>To allocate</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={[num(700), { fontSize: 13, color: allocTone }]}>{m0(remaining)}</Text>
          </View>
        </View>
      </View>

      {/* Smart budgeting controls */}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
        <Pressable
          onPress={runAutoBudget}
          disabled={autoBusy}
          accessibilityRole="button"
          style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c('primary', 0.4), backgroundColor: c('primary', 0.08) }, pressed && { opacity: 0.85 }]}
        >
          {autoBusy ? <ActivityIndicator size="small" color={c('primary')} /> : <Icon name="sparkles" size={16} color={c('primary')} />}
          <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('primary') }}>Auto-budget</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c('border'), backgroundColor: c('surface') }}>
          <View>
            <Text style={{ fontSize: 12, fontFamily: ff.semi, color: c('fg') }}>Rollover</Text>
            <Text style={{ fontSize: 9.5, color: c('fgMuted') }}>Carry leftovers</Text>
          </View>
          <Toggle on={rolloverOn} onPress={() => { haptics.tap(); setBudgetRollover(!rolloverOn); }} />
        </View>
      </View>

      <SectionHeader
        title="Categories"
        action={<Pressable hitSlop={8} onPress={() => setSheet({ editing: null })}><Text style={{ color: c('primary'), fontSize: 12, fontFamily: ff.med }}>+ Add</Text></Pressable>}
      />

      {cats.length === 0 ? (
        <EmptyState
          icon="scale"
          title="No budgets yet"
          message="Give each spending category a monthly limit and SafeSpend warns you before you go over."
          actionLabel="Set a budget"
          onAction={() => setSheet({ editing: null })}
        />
      ) : null}

      {cats.map((cat, i) => {
        const pct = cat.limit > 0 ? (cat.spent / cat.limit) * 100 : 0;
        const over = cat.spent > cat.limit;
        const tone = over ? c('expense') : pct > 80 ? c('warning') : hsl(cat.color);
        const rem = cat.limit - cat.spent;
        return (
          <Reveal key={cat.id} delay={i * 40}>
          <Pressable onPress={() => setSheet({ editing: { ...cat, limit: cat.baseLimit } })} style={({ pressed }) => [{ backgroundColor: c('surface'), borderWidth: 1, borderColor: over ? c('expense', 0.3) : c('border'), borderRadius: 14, padding: 14, ...shadow(1) }, pressed && { backgroundColor: c('surfaceHover') }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <RingProgress percentage={Math.min(pct, 100)} size={44} strokeWidth={4} color={tone}>
                <Icon name={cat.icon} size={16} color={hsl(cat.color)} />
              </RingProgress>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{cat.name}</Text>
                <Text style={[num(400), { fontSize: 12, color: c('fgMuted'), marginTop: 2 }]}>{`${m0(cat.spent)} of ${m0(cat.limit)}`}</Text>
                {rolloverOn && cat.rollover ? (
                  <Text style={{ fontSize: 10.5, color: cat.rollover >= 0 ? c('income') : c('warning'), marginTop: 1 }}>
                    {cat.rollover >= 0 ? `+${m0(cat.rollover)} rolled over` : `${m0(cat.rollover)} carried over`}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[num(700), { fontSize: 14, color: tone }]}>{over ? `+${m0(Math.abs(rem))}` : m0(rem)}</Text>
                <Text style={{ fontSize: 10, color: c('fgMuted'), marginTop: 1 }}>{over ? 'over' : 'left'}</Text>
              </View>
            </View>
            <ProgressBar value={Math.min(pct, 100)} color={tone} height={5} />
          </Pressable>
          </Reveal>
        );
      })}

      <BudgetSheet open={!!sheet} editing={sheet?.editing} budgetedIds={budgetedIds} onClose={() => setSheet(null)} onSaved={reload} />
    </View>
  );
}

// Function (not a const) so c() is read at render — survives theme switches.
const styles_kicker = () => ({ fontSize: 9, color: c('fgMuted'), letterSpacing: 0.5, textTransform: 'uppercase' });
