import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { c, hsl, ff, num, alpha } from '../theme/tokens';
import { Icon } from '../components';
import { moneyCompact } from '../lib/format';
import { useAnnualBudget } from '../hooks/useAnnualBudget';
import { ErrorState } from '../components/ErrorState';
import { ScreenSkeleton } from '../components/Skeleton';
import { useSettings } from '../contexts/SettingsContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NAME_W = 116;
const CELL_W = 62;
const HEADER_H = 34;
const ROW_H = 54;
const TOTAL_H = 44;
const curMonth = new Date().getMonth();
const thisYear = new Date().getFullYear();

export default function AnnualBudgetScreen() {
  const [year, setYear] = useState(thisYear);
  const { data, error, reload } = useAnnualBudget(year);
  const { settings } = useSettings();
  const mc = (n) => moneyCompact(n, settings.currency);

  if (error && !data) return <ErrorState onRetry={reload} />;
  if (!data) return <ScreenSkeleton />;

  const { rows, expByMonth, totalYearBudget, totalYearActual, totalYearIncome, totalYearExpenses } = data;
  const remaining = totalYearBudget - totalYearActual;

  // Background tint for a month cell based on spend vs the category's monthly limit.
  const cellTone = (actual, limit) => {
    if (limit <= 0) return { bg: 'transparent', fg: c('fgMuted') };
    const pct = (actual / limit) * 100;
    if (actual === 0) return { bg: 'transparent', fg: c('fgMuted') };
    if (pct > 100) return { bg: alpha(c('expense'), 0.16), fg: c('expense') };
    if (pct > 80) return { bg: alpha(c('warning'), 0.16), fg: c('warning') };
    return { bg: alpha(c('income'), 0.13), fg: c('income') };
  };

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 12 }}>
      {/* Year selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Pressable hitSlop={10} onPress={() => setYear((y) => y - 1)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevronLeft" size={18} color={c('fg')} />
        </Pressable>
        <Text style={[num(700), { fontSize: 18, color: c('fg'), minWidth: 64, textAlign: 'center' }]}>{year}</Text>
        <Pressable hitSlop={10} onPress={() => setYear((y) => Math.min(thisYear + 1, y + 1))} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center', opacity: year >= thisYear + 1 ? 0.4 : 1 }}>
          <Icon name="chevronRight" size={18} color={c('fg')} />
        </Pressable>
      </View>

      {/* Annual summary */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          { lbl: 'Budgeted', v: mc(totalYearBudget), col: c('fg') },
          { lbl: 'Spent', v: mc(totalYearActual), col: c('expense') },
          { lbl: remaining >= 0 ? 'Left' : 'Over', v: mc(Math.abs(remaining)), col: remaining >= 0 ? c('income') : c('expense') },
        ].map((x) => (
          <View key={x.lbl} style={{ flex: 1, backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 12, padding: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: c('fgMuted'), textTransform: 'uppercase', letterSpacing: 0.5 }}>{x.lbl}</Text>
            <Text style={[num(700), { fontSize: 15, color: x.col, marginTop: 3 }]}>{x.v}</Text>
          </View>
        ))}
      </View>

      {rows.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
          <Icon name="barChart" size={24} color={c('fgMuted')} />
          <Text style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center' }}>No budgets set. Add monthly limits on the Budget tab to see the yearly plan.</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row' }}>
            {/* Fixed category column */}
            <View style={{ width: NAME_W, borderRightWidth: 1, borderRightColor: c('border', 0.6) }}>
              <View style={{ height: HEADER_H, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: c('surfaceSecondary') }}>
                <Text style={{ fontSize: 10, fontFamily: ff.semi, color: c('fgMuted'), textTransform: 'uppercase', letterSpacing: 0.5 }}>Category</Text>
              </View>
              {rows.map((r) => (
                <View key={r.id} style={{ height: ROW_H, justifyContent: 'center', paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: c('border', 0.4) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: hsl(r.color, 0.18), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={r.icon} size={12} color={hsl(r.color)} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 12, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{r.name}</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: c('fgMuted'), marginTop: 2 }}>{mc(r.limit)}/mo</Text>
                </View>
              ))}
              <View style={{ height: TOTAL_H, justifyContent: 'center', paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: c('border'), backgroundColor: c('surfaceSecondary') }}>
                <Text style={{ fontSize: 11, fontFamily: ff.bold, color: c('fg') }}>Total spent</Text>
              </View>
            </View>

            {/* Scrollable month columns */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row', height: HEADER_H, backgroundColor: c('surfaceSecondary') }}>
                  {MONTHS.map((m, i) => (
                    <View key={m} style={{ width: CELL_W, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontFamily: ff.semi, color: year === thisYear && i === curMonth ? c('primary') : c('fgMuted'), textTransform: 'uppercase' }}>{m}</Text>
                    </View>
                  ))}
                </View>
                {rows.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', height: ROW_H, borderTopWidth: 1, borderTopColor: c('border', 0.4) }}>
                    {r.months.map((actual, i) => {
                      const tone = cellTone(actual, r.limit);
                      return (
                        <View key={i} style={{ width: CELL_W, justifyContent: 'center', alignItems: 'center', backgroundColor: tone.bg }}>
                          <Text style={[num(600), { fontSize: 11, color: tone.fg }]}>{actual > 0 ? mc(actual) : '–'}</Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
                <View style={{ flexDirection: 'row', height: TOTAL_H, borderTopWidth: 1, borderTopColor: c('border'), backgroundColor: c('surfaceSecondary') }}>
                  {expByMonth.map((v, i) => (
                    <View key={i} style={{ width: CELL_W, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={[num(700), { fontSize: 11, color: c('fg') }]}>{v > 0 ? mc(v) : '–'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* Income vs spend for the year */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: c('income', 0.08), borderWidth: 1, borderColor: c('income', 0.2), borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 10, color: c('fgMuted'), textTransform: 'uppercase', letterSpacing: 0.5 }}>Year income</Text>
          <Text style={[num(700), { fontSize: 16, color: c('income'), marginTop: 3 }]}>{mc(totalYearIncome)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c('expense', 0.08), borderWidth: 1, borderColor: c('expense', 0.2), borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 10, color: c('fgMuted'), textTransform: 'uppercase', letterSpacing: 0.5 }}>Year spending</Text>
          <Text style={[num(700), { fontSize: 16, color: c('expense'), marginTop: 3 }]}>{mc(totalYearExpenses)}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', lineHeight: 16 }}>
        Cells are tinted green under budget, amber near the limit and red when over. Scroll sideways to see every month.
      </Text>
    </View>
  );
}
