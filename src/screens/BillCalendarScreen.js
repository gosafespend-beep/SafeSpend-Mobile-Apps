import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Alert } from 'react-native';
import { c, ff, num, alpha, shadow } from '../theme/tokens';
import { Card, Badge, PeriodPill, Icon, Button } from '../components';
import { Reveal } from '../components/motion';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useBills } from '../hooks/useBills';
import { useAccounts } from '../hooks/useAccounts';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import BillSheet from '../sheets/BillSheet';
import ActionSheet from '../components/ActionSheet';
import { bumpRefresh } from '../contexts/RefreshContext';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function BillCalendarScreen() {
  const { data, loading, error, reload, markPaid } = useBills();
  const { data: acctData } = useAccounts();
  const { settings } = useSettings();
  const { requireWrite } = useEntitlement();
  const m0 = (n) => money(n, { currency: settings.currency, cents: false });
  const [sheet, setSheet] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [menuBill, setMenuBill] = useState(null);
  const [payBill, setPayBill] = useState(null);

  const accounts = acctData?.accounts || [];

  // With multiple accounts, ask which one the bill is paid from; otherwise just
  // confirm (posts to the single/primary account).
  const confirmPaid = (b) => {
    if (!requireWrite('mark_paid')) return; // marking paid records an expense
    if (accounts.length > 1) { setPayBill(b); return; }
    Alert.alert('Mark as paid?', `${b.name} · ${m0(b.amount)}\nThis records an expense on your account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark paid', onPress: () => markPaid(b) },
    ]);
  };

  const onLong = (b) => setMenuBill(b);
  const confirmDelete = (b) =>
    Alert.alert('Delete bill?', 'This recurring bill will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error: e } = await supabase.from('bills').update({ is_active: false }).eq('id', b.id);
          if (e) Alert.alert('Could not delete', e.message); else bumpRefresh();
        },
      },
    ]);

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { monthName, month, year, daysInMonth, firstWeekday, today, bills } = data;
  const monthAbbrev = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, month, 1));

  const billsByDay = {};
  bills.forEach((b) => { (billsByDay[b.day] = billsByDay[b.day] || []).push(b); });

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const overdue = bills.filter((b) => !b.paid && b.day < today).sort((a, b) => a.day - b.day);
  const upcoming = bills.filter((b) => !b.paid && b.day >= today).sort((a, b) => a.day - b.day);
  const paid = bills.filter((b) => b.paid).sort((a, b) => a.day - b.day);
  const upcomingTotal = upcoming.reduce((s, b) => s + b.amount, 0);
  const overdueTotal = overdue.reduce((s, b) => s + b.amount, 0);

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      <View style={{ alignItems: 'center' }}>
        <PeriodPill value={monthName} />
      </View>

      <Button block variant="outline" icon="plus" onPress={() => setSheet(true)}>Add bill</Button>

      {bills.length === 0 ? (
        <EmptyState
          icon="calendar"
          tone={c('warning')}
          title="No bills yet"
          message="Add recurring bills — rent, utilities, subscriptions — to see due dates and never miss one."
          actionLabel="Add bill"
          onAction={() => setSheet(true)}
        />
      ) : (
        <Reveal y={6} style={{ gap: 12 }}>
          {/* Calendar */}
          <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 14, ...shadow(1) }}>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              {WEEKDAYS.map((w, i) => (
                <Text key={i} style={{ flex: 1, fontSize: 10, fontFamily: ff.semi, letterSpacing: 0.5, textTransform: 'uppercase', color: c('fgMuted'), textAlign: 'center', paddingVertical: 4 }}>{w}</Text>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                {week.map((d, di) => {
                  if (d === null) return <View key={di} style={{ flex: 1, aspectRatio: 1 / 1.05 }} />;
                  const dayBills = billsByDay[d];
                  const isToday = d === today;
                  const hasUnpaid = dayBills && dayBills.some((b) => !b.paid);
                  return (
                    <View key={di} style={{ flex: 1, aspectRatio: 1 / 1.05, borderRadius: 8, padding: 4, backgroundColor: isToday ? c('primary', 0.18) : 'transparent', borderWidth: 1, borderColor: isToday ? c('primary', 0.4) : 'transparent' }}>
                      <Text style={[num(600), { fontSize: 11, color: isToday ? c('primary') : hasUnpaid ? c('fg') : c('fgMuted') }]}>{d}</Text>
                      {dayBills ? (
                        <View style={{ flexDirection: 'row', gap: 2, marginTop: 'auto', flexWrap: 'wrap' }}>
                          {dayBills.slice(0, 3).map((b, bi) => (
                            <View key={bi} style={{ width: 5, height: 5, borderRadius: 9999, backgroundColor: b.paid ? alpha(b.color, 0.33) : b.color, borderWidth: b.paid ? 1 : 0, borderColor: b.color }} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Overdue — unpaid bills whose due day already passed this month */}
          {overdue.length > 0 ? (
            <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('expense', 0.35), borderRadius: 14, overflow: 'hidden', ...shadow(1) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 14, paddingBottom: 6, paddingHorizontal: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="alertTriangle" size={14} color={c('expense')} />
                  <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('expense') }}>Overdue</Text>
                </View>
                <Text style={[num(400), { fontSize: 11, color: c('expense') }]}>{`-${m0(overdueTotal)}`}</Text>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: c('border', 0.5), marginTop: 4 }}>
                {overdue.map((b, i) => (
                  <Pressable key={i} onPress={() => confirmPaid(b)} onLongPress={() => onLong(b)} delayLongPress={300} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i < overdue.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }, pressed && { backgroundColor: c('surfaceHover') }]}>
                    <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: c('expense', 0.13), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 8, fontFamily: ff.semi, letterSpacing: 0.5, textTransform: 'uppercase', color: c('expense') }}>{monthAbbrev}</Text>
                      <Text style={[num(700), { fontSize: 14, color: c('expense') }]}>{b.day}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{b.name}</Text>
                      <Text style={{ fontSize: 11, color: c('expense'), marginTop: 2 }}>{`${today - b.day} day${today - b.day === 1 ? '' : 's'} overdue · tap to mark paid`}</Text>
                    </View>
                    <Text style={[num(600), { fontSize: 14, color: c('expense') }]}>{m0(b.amount)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Upcoming */}
          {upcoming.length > 0 ? (
            <Card title="Upcoming this month" padded={false} action={<Text style={[num(400), { fontSize: 11, color: c('expense') }]}>{`-${m0(upcomingTotal)}`}</Text>}>
              <View style={{ borderTopWidth: 1, borderTopColor: c('border', 0.5), marginTop: 4 }}>
                {upcoming.map((b, i) => (
                  <Pressable key={i} onPress={() => confirmPaid(b)} onLongPress={() => onLong(b)} delayLongPress={300} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i < upcoming.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }, pressed && { backgroundColor: c('surfaceHover') }]}>
                    <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: alpha(b.color, 0.13), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 8, fontFamily: ff.semi, letterSpacing: 0.5, textTransform: 'uppercase', color: b.color }}>{monthAbbrev}</Text>
                      <Text style={[num(700), { fontSize: 14, color: b.color }]}>{b.day}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{b.name}</Text>
                      <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{b.day === today ? 'Due today · tap to mark paid' : `Due in ${b.day - today} day${b.day - today === 1 ? '' : 's'} · tap to mark paid`}</Text>
                    </View>
                    <Text style={[num(600), { fontSize: 14, color: c('fg') }]}>{m0(b.amount)}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Paid */}
          {paid.length > 0 ? (
            <Card title="Paid this month" padded={false}>
              <View style={{ borderTopWidth: 1, borderTopColor: c('border', 0.5), marginTop: 4 }}>
                {paid.map((b, i) => (
                  <Pressable key={i} onLongPress={() => onLong(b)} delayLongPress={300} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, minHeight: 48, borderBottomWidth: i < paid.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4), opacity: 0.55 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: c('income') }} />
                    <Text style={{ flex: 1, fontSize: 13, color: c('fg') }}>{b.name}</Text>
                    <Badge variant="income" icon="check">Paid</Badge>
                    <Text style={[num(500), { fontSize: 13, color: c('fgMuted') }]}>{m0(b.amount)}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}
        </Reveal>
      )}

      <BillSheet open={sheet} onClose={() => setSheet(false)} onSaved={reload} />
      <BillSheet open={!!editBill} editing={editBill} onClose={() => setEditBill(null)} onSaved={reload} />
      <ActionSheet
        open={!!menuBill}
        title={menuBill?.name}
        subtitle={menuBill ? m0(menuBill.amount) : undefined}
        onClose={() => setMenuBill(null)}
        options={menuBill ? [
          ...(menuBill.paid ? [] : [{ label: 'Mark paid', icon: 'check', onPress: () => confirmPaid(menuBill) }]),
          { label: 'Edit bill', icon: 'pencil', onPress: () => setEditBill(menuBill) },
          { label: 'Delete bill', icon: 'trash', destructive: true, onPress: () => confirmDelete(menuBill) },
        ] : []}
      />
      <ActionSheet
        open={!!payBill}
        title={payBill ? `Pay ${payBill.name}` : undefined}
        subtitle={payBill ? `${m0(payBill.amount)} · choose account` : undefined}
        onClose={() => setPayBill(null)}
        options={payBill ? accounts.map((a) => ({
          label: a.name,
          icon: a.icon,
          // Each account's balance is in ITS OWN currency — formatting with the
          // display currency printed a "$" over a raw KES figure (a Ksh 156,966
          // balance read as "$156,966"). The bill amount above stays in the
          // display currency, which is what bills are denominated in.
          value: money(a.balance, { currency: a.currency || settings.currency, cents: false }),
          onPress: () => markPaid(payBill, a.id),
        })) : []}
      />
    </View>
  );
}
