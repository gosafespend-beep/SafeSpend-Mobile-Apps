import React, { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FormSheet, SegmentField } from '../components/FormSheet';
import { c, ff } from '../theme/tokens';
import { useSettings, budgetPeriodLabel } from '../contexts/SettingsContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BudgetPeriodSheet({ open, onClose, bottomInset = 0 }) {
  const { settings, updateSetting } = useSettings();
  const thisYear = new Date().getFullYear();
  const [month, setMonth] = useState(settings.budgetStartMonth ?? 0);
  const [year, setYear] = useState(settings.budgetStartYear ?? thisYear);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMonth(settings.budgetStartMonth ?? 0);
      setYear(settings.budgetStartYear ?? thisYear);
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    await updateSetting({ budgetStartMonth: month, budgetStartYear: year });
    setSaving(false);
    onClose && onClose();
  };

  const yearOpts = [thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: String(y) }));

  return (
    <FormSheet open={open} onClose={onClose} title="Budget period" onSave={save} saving={saving} saveLabel="Save period" bottomInset={bottomInset}>
      <Text style={{ fontSize: 13, color: c('fgMuted'), lineHeight: 18 }}>
        Choose the month your 12-month budget cycle begins.
      </Text>

      <View>
        <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 8 }}>Start month</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MONTHS.map((m, idx) => {
            const active = month === idx;
            return (
              <Pressable key={m} onPress={() => setMonth(idx)} style={{ width: '22%', height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c('primary') : c('surfaceSecondary') }}>
                <Text style={{ fontSize: 13, fontFamily: ff.semi, color: active ? '#fff' : c('fg') }}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SegmentField label="Start year" options={yearOpts} value={year} onChange={setYear} />

      <View style={{ padding: 12, borderRadius: 12, backgroundColor: c('surfaceSecondary') }}>
        <Text style={{ fontSize: 11, color: c('fgMuted'), marginBottom: 2 }}>Current period</Text>
        <Text style={{ fontSize: 14, fontFamily: ff.semi, color: c('fg') }}>{budgetPeriodLabel(month, year)}</Text>
      </View>
    </FormSheet>
  );
}
