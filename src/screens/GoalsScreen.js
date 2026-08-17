import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { c, hsl, ff, num, shadow } from '../theme/tokens';
import { SectionHeader, RingProgress, Icon } from '../components';
import { Reveal } from '../components/motion';
import { money } from '../lib/format';
import { useGoals } from '../hooks/useGoals';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import { AddGoalSheet, ContributionSheet } from '../sheets/GoalSheets';
import ActionSheet from '../components/ActionSheet';
import Confetti from '../components/Confetti';
import { useToast } from '../contexts/ToastContext';
import { bumpRefresh } from '../contexts/RefreshContext';

export default function GoalsScreen({ onOpen }) {
  const { data, loading, error, reload } = useGoals();
  const { settings } = useSettings();
  const { show } = useToast();
  const m0 = (n) => money(n, { currency: settings.currency, cents: false });
  const [addOpen, setAddOpen] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [contribGoal, setContribGoal] = useState(null);
  const [menuGoal, setMenuGoal] = useState(null);
  const [celebrate, setCelebrate] = useState(0);
  const doneIdsRef = useRef(null);
  const halfIdsRef = useRef(null);

  // Celebrate when a goal *newly* crosses 100% (confetti) or the halfway mark
  // (a lighter nudge) — never on first load or for already-passed milestones.
  useEffect(() => {
    if (!data) return;
    const pctOf = (g) => (g.target > 0 ? (g.current / g.target) * 100 : 0);
    const nowDone = new Set(data.goals.filter((g) => g.done).map((g) => g.id));
    const nowHalf = new Set(data.goals.filter((g) => !g.done && pctOf(g) >= 50).map((g) => g.id));
    if (doneIdsRef.current === null) { doneIdsRef.current = nowDone; halfIdsRef.current = nowHalf; return; }
    let justFinished = false; let justHalf = false;
    nowDone.forEach((id) => { if (!doneIdsRef.current.has(id)) justFinished = true; });
    nowHalf.forEach((id) => { if (!halfIdsRef.current.has(id)) justHalf = true; });
    doneIdsRef.current = nowDone; halfIdsRef.current = nowHalf;
    if (justFinished) {
      setCelebrate((n) => n + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      show('🎉 Goal reached — amazing work!', { icon: 'check' });
    } else if (justHalf) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      show('Halfway to your goal! 💪', { icon: 'target' });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLong = (goal) => setMenuGoal(goal);
  const confirmDelete = (goal) =>
    Alert.alert('Delete goal?', 'The goal and its contribution history will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('goal_contributions').delete().eq('goal_id', goal.id);
          const { error: e } = await supabase.from('savings_goals').delete().eq('id', goal.id);
          if (e) Alert.alert('Could not delete', e.message); else bumpRefresh();
        },
      },
    ]);

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { goals, totalCurrent, totalTarget } = data;

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c('income', 0.2), padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden' }}>
        <LinearGradient colors={[c('income', 0.1), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c('income', 0.2), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="target" size={20} color={c('income')} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.8, textTransform: 'uppercase', color: c('fgMuted') }}>Saved across all goals</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[num(700), { fontSize: 24, color: c('income'), letterSpacing: -0.24, marginTop: 2 }]}>{m0(totalCurrent)}</Text>
          <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{`of ${m0(totalTarget)} target across ${goals.length} goals`}</Text>
        </View>
      </View>

      <SectionHeader title="Active goals" action={<Pressable hitSlop={8} onPress={() => setAddOpen(true)}><Text style={{ color: c('primary'), fontSize: 12, fontFamily: ff.med }}>+ New goal</Text></Pressable>} />

      {goals.length === 0 ? (
        <EmptyState
          icon="target"
          tone={c('income')}
          title="No goals yet"
          message="Set a target — a trip, an emergency fund, a new laptop — and watch your progress fill up."
          actionLabel="New goal"
          onAction={() => setAddOpen(true)}
        />
      ) : null}

      {goals.map((goal, gi) => {
        const pct = goal.target > 0 ? (goal.current / goal.target) * 100 : 0;
        const ringColor = goal.done ? c('income') : pct > 80 ? c('warning') : hsl(goal.color);
        return (
          <Reveal key={goal.id} delay={gi * 40}>
          <Pressable onPress={() => onOpen && onOpen(goal)} onLongPress={() => onLong(goal)} delayLongPress={300} style={({ pressed }) => [{ backgroundColor: c('surface'), borderWidth: 1, borderColor: goal.done ? c('income', 0.4) : c('border'), borderRadius: 14, padding: 16, ...shadow(1) }, pressed && { backgroundColor: c('surfaceHover') }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <RingProgress percentage={Math.min(pct, 100)} size={64} strokeWidth={6} color={ringColor}>
                {goal.done ? (
                  <Icon name="check" size={22} color={c('income')} stroke={2.5} />
                ) : (
                  <Text style={[num(700), { fontSize: 12, color: c('fg') }]}>{`${Math.round(pct)}%`}</Text>
                )}
              </RingProgress>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={goal.icon} size={14} color={hsl(goal.color)} />
                  <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>{goal.name}</Text>
                </View>
                <Text style={[num(400), { fontSize: 12, color: c('fgMuted'), marginTop: 4 }]}>{`${m0(goal.current)} of ${m0(goal.target)}`}</Text>
                {goal.done ? (
                  <Text style={{ fontSize: 12, color: c('income'), marginTop: 4, fontFamily: ff.med }}>🎉 Goal completed!</Text>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                    {goal.deadline ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon name="calendar" size={11} color={c('fgMuted')} />
                        <Text style={{ fontSize: 11, color: c('fgMuted') }}>{goal.deadline}</Text>
                      </View>
                    ) : null}
                    {goal.perMo ? <Text style={[num(400), { fontSize: 11, color: c('primary') }]}>{`Save ${m0(goal.perMo)}/mo`}</Text> : null}
                  </View>
                )}
              </View>
              {!goal.done ? (
                <Pressable hitSlop={6} onPress={() => setContribGoal(goal)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 11, backgroundColor: c('primary'), alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.85 }]}>
                  <Icon name="plus" size={18} stroke={2.5} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </Pressable>
          </Reveal>
        );
      })}

      <Confetti trigger={celebrate} />

      <AddGoalSheet open={addOpen} onClose={() => setAddOpen(false)} onSaved={reload} />
      <AddGoalSheet open={!!editGoal} editing={editGoal} onClose={() => setEditGoal(null)} onSaved={reload} />
      <ContributionSheet open={!!contribGoal} goal={contribGoal} onClose={() => setContribGoal(null)} onSaved={reload} />
      <ActionSheet
        open={!!menuGoal}
        title={menuGoal?.name}
        onClose={() => setMenuGoal(null)}
        options={menuGoal ? [
          { label: 'Add contribution', icon: 'plus', onPress: () => setContribGoal(menuGoal) },
          { label: 'Edit goal', icon: 'pencil', onPress: () => setEditGoal(menuGoal) },
          { label: 'Delete goal', icon: 'trash', destructive: true, onPress: () => confirmDelete(menuGoal) },
        ] : []}
      />
    </View>
  );
}
