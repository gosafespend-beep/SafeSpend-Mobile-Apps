import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { c, ff, num, alpha } from '../theme/tokens';
import { Input, Card, SectionHeader, Icon } from '../components';
import { money } from '../lib/format';
import { useTransactions } from '../hooks/useTransactions';
import { useSettings } from '../contexts/SettingsContext';

function shortDate(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso + 'T00:00:00'));
}

export default function SearchScreen({ onOpenTxn }) {
  const [query, setQuery] = useState('');
  // allTime: search must not be silently scoped to the selected month/year.
  const { days, loading } = useTransactions('All', { allTime: true });
  const { settings } = useSettings();
  const m = (n) => money(n, { currency: settings.currency });

  // Flatten the grouped days back into a single list to search.
  const all = useMemo(() => days.flatMap((d) => d.items), [days]);
  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (q.length === 0 ? [] : all.filter((t) => t.label.toLowerCase().includes(q) || (t.cat || '').toLowerCase().includes(q))),
    [all, q]
  );
  const total = results.reduce((s, r) => s + r.amount, 0);

  return (
    <View style={{ padding: 14, paddingBottom: 28 }}>
      <Input leading="search" placeholder="Search transactions…" value={query} onChange={setQuery} />

      {q.length === 0 ? (
        <View style={{ padding: 36, alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={26} color={c('fgMuted')} />
          <Text style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center' }}>Search all your transactions by merchant, note, or category.</Text>
        </View>
      ) : loading ? (
        <View style={{ padding: 36, alignItems: 'center' }}><ActivityIndicator color={c('primary')} /></View>
      ) : results.length === 0 ? (
        <View style={{ padding: 36, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: c('fgMuted') }}>{`No matches for “${query}”.`}</Text>
        </View>
      ) : (
        <>
          <View style={{ marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c('primary', 0.2), overflow: 'hidden' }}>
            <LinearGradient colors={[c('primary', 0.1), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <Text style={{ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted') }}>{`${results.length} match${results.length === 1 ? '' : 'es'}`}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
              <Text style={[num(700), { fontSize: 22, color: c('fg'), letterSpacing: -0.22 }]}>{m(total)}</Text>
              <Text style={[num(400), { fontSize: 12, color: c('fgMuted') }]}>{`avg ${m(total / results.length)}/txn`}</Text>
            </View>
          </View>

          <SectionHeader title="Results" />
          <Card padded={false}>
            {results.slice(0, 100).map((r, i) => {
              const tone = r.type === 'income' ? c('income') : c('expense');
              return (
                <Pressable key={r.id || i} onPress={() => onOpenTxn && onOpenTxn(r)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) }, pressed && { backgroundColor: c('surfaceHover') }]}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: alpha(tone, 0.15), alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={r.icon} size={17} color={tone} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }} numberOfLines={1}>{r.label}</Text>
                    <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{`${shortDate(r.date)} · ${r.cat}`}</Text>
                  </View>
                  <Text style={[num(600), { fontSize: 14, color: tone }]}>{`${r.type === 'income' ? '+' : '-'}${money(r.amount, { currency: r.currency || settings.currency })}`}</Text>
                </Pressable>
              );
            })}
          </Card>
          {results.length > 100 ? (
            <Text style={{ fontSize: 11, color: c('fgMuted'), textAlign: 'center', marginTop: 10 }}>
              {`Showing first 100 of ${results.length} — refine your search to narrow it down.`}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
