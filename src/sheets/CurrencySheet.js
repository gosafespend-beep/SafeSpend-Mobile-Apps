import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { FormSheet } from '../components/FormSheet';
import { Input, Icon } from '../components';
import { c, ff } from '../theme/tokens';
import { SUPPORTED_CURRENCIES } from '../lib/format';
import { useSettings } from '../contexts/SettingsContext';
import { bumpRefresh } from '../contexts/RefreshContext';

export default function CurrencySheet({ open, onClose, bottomInset = 0 }) {
  const { settings, updateSetting } = useSettings();
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const q = query.trim().toLowerCase();
  const list = SUPPORTED_CURRENCIES.filter(
    (x) => !q || x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q) || x.country.toLowerCase().includes(q)
  );

  // Each bill / goal / debt / asset row now stores its OWN currency and is
  // converted on read, so switching the display currency must NOT rewrite stored
  // amounts — doing so would double-convert them. (Rows created before that fix
  // carry the column default 'USD'; those few legacy rows are the only ones whose
  // label may not match how the amount was typed.)
  const pick = async (code) => {
    setSaving(true);
    await updateSetting({ currency: code });
    bumpRefresh();
    setSaving(false);
    onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title="Currency" onSave={onClose} saving={saving} saveLabel="Done" bottomInset={bottomInset}>
      <Input leading="search" placeholder="Search currency" value={query} onChange={setQuery} />
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {list.map((cur) => {
          const active = settings.currency === cur.code;
          return (
            <Pressable key={cur.code} onPress={() => pick(cur.code)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c('border', 0.4) }, pressed && { backgroundColor: c('surfaceHover') }]}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>{cur.symbol}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{`${cur.code} · ${cur.name}`}</Text>
                <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{cur.country}</Text>
              </View>
              {active ? <Icon name="check" size={18} color={c('primary')} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </FormSheet>
  );
}
