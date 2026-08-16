import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { c, hsl, alpha, ff, num, R, shadow } from '../theme/tokens';
import { Input, Button, Icon, Toggle } from '../components';
import { DateField } from '../components/FormSheet';
import { useSheetDrag } from '../components/useSheetDrag';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import { useRegion } from '../contexts/RegionContext';
import { useFx } from '../contexts/FxContext';
import { toUsd } from '../lib/fx';
import { useCategories } from '../hooks/useCategories';
import { useAccounts } from '../hooks/useAccounts';
import { currencySymbol } from '../lib/format';
import { todayISO } from '../lib/date';
import { supabase } from '../lib/supabase';
import { parseReceipt, uploadReceipt } from '../lib/dataManagement';
import { rememberRule, lookupRule } from '../lib/merchantRules';
import { parseNaturalLanguage } from '../lib/nlparse';
import { advanceDate } from '../lib/recurring';
import { enqueueInsert, isNetworkError } from '../lib/writeQueue';
import { useToast } from '../contexts/ToastContext';
import ImportWizard from '../sheets/ImportWizard';

const DEFAULT_EXPENSE = [
  { name: 'Groceries', icon: 'shopping', color: '158 64% 45%' },
  { name: 'Eating out', icon: 'utensils', color: '38 92% 50%' },
  { name: 'Transport', icon: 'car', color: '45 93% 47%' },
  { name: 'Bills', icon: 'receipt', color: '350 70% 55%' },
  { name: 'Subscriptions', icon: 'film', color: '262 52% 56%' },
  { name: 'Fun', icon: 'sparkles', color: '200 70% 50%' },
];
const DEFAULT_INCOME = [
  { name: 'Paycheck', icon: 'wallet', color: '158 64% 45%' },
  { name: 'Side gig', icon: 'sparkles', color: '168 76% 42%' },
  { name: 'Gift', icon: 'piggy', color: '262 52% 56%' },
  { name: 'Refund', icon: 'trendingUp', color: '200 70% 50%' },
];
const today = todayISO;

export default function AddSheet({ open, onClose, onSaved, bottomInset = 0, initialMode }) {
  const { translateY, panHandlers } = useSheetDrag(onClose);
  const { show: showToast } = useToast();
  const { user } = useAuth();
  const { canWrite, presentPaywall } = useEntitlement();
  const { country } = useRegion();
  const { settings } = useSettings();
  const { convert, hasRate } = useFx();
  const { data: catData } = useCategories();
  const { data: acctData } = useAccounts();
  const [mode, setMode] = useState('manual'); // manual | scan
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [quick, setQuick] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [receipt, setReceipt] = useState(null); // scanned/attached asset
  const [fromReceipt, setFromReceipt] = useState(false);
  const [splitOn, setSplitOn] = useState(false);
  const [splits, setSplits] = useState([]); // [{ category, amount }]
  const [showAllCats, setShowAllCats] = useState(false);

  const accounts = acctData?.accounts || [];
  // The amount is stored in the selected account's currency, so show its symbol.
  const acctCurrency = accounts.find((a) => a.id === accountId)?.currency || settings.currency;
  const sym = currencySymbol(acctCurrency);
  const cats = useMemo(() => {
    const real = type === 'expense' ? catData.expense : catData.income;
    const list = real && real.length ? [...real] : type === 'expense' ? DEFAULT_EXPENSE : DEFAULT_INCOME;
    // Most-used first (real categories carry a monthly `count`).
    return list.slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [type, catData]);

  // Collapsed grid shows the top-6 most-used; the selected one is always kept
  // visible even if it lives further down the (expandable) list.
  const shownCats = useMemo(() => {
    if (showAllCats) return cats;
    const top = cats.slice(0, 6);
    if (category && !top.some((x) => x.name === category)) {
      const sel = cats.find((x) => x.name === category);
      if (sel) return [...top.slice(0, 5), sel];
    }
    return top;
  }, [cats, showAllCats, category]);

  const reset = () => {
    setMode('manual'); setType('expense'); setAmount(''); setNote(''); setQuick('');
    setDate(today()); setRecurring(false); setReceipt(null); setFromReceipt(false);
    setSplitOn(false); setSplits([]); setShowAllCats(false);
  };
  useEffect(() => { if (open) { reset(); if (initialMode) setMode(initialMode); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Read-only wall: a non-subscriber can't log — bounce to the paywall instead.
  useEffect(() => {
    if (open && !canWrite) { onClose && onClose(); presentPaywall(initialMode === 'scan' ? 'scan' : 'add_txn'); }
  }, [open, canWrite]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!cats.find((x) => x.name === category)) setCategory(cats[0]?.name || ''); }, [cats]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId == null && accounts.length) setAccountId(accounts[0].id); }, [accounts, accountId]);

  // Natural-language quick add: "coffee 4.50" → prefill.
  const applyQuick = () => {
    const parsed = parseNaturalLanguage(quick);
    if (!parsed) { Alert.alert('Try again', 'Type something like “coffee 4.50”.'); return; }
    setType(parsed.type);
    setAmount(String(parsed.amount));
    if (parsed.note) setNote(parsed.note);
    setQuick('');
  };

  const suggestCategory = async () => {
    if (aiBusy || note.trim().length < 2) return;
    // 1. A learned rule for this merchant wins instantly (free, offline).
    if (type === 'expense') {
      const learned = await lookupRule(user?.id, note);
      if (learned && cats.find((x) => x.name === learned)) { setCategory(learned); return; }
    }
    // 2. Otherwise ask the AI.
    setAiBusy(true);
    try {
      const payload = cats.map((x) => ({ id: x.id || x.name, name: x.name, isNeed: !!x.isNeed }));
      const { data } = await supabase.functions.invoke('ai-categorize', { body: { description: note, categories: payload, transactionType: type, country, currency: settings.currency } });
      const top = data?.suggestions?.[0];
      if (top && cats.find((x) => x.name === top.categoryName)) setCategory(top.categoryName);
      else if (data?.error) Alert.alert('Suggestion unavailable', 'AI categorization needs a Premium plan.');
    } catch { /* best-effort */ }
    setAiBusy(false);
  };

  // Receipt scan → OCR → prefill.
  const scan = async (fromCamera) => {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', fromCamera ? 'Allow the camera to scan receipts.' : 'Allow photo access to pick a receipt.'); return; }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setScanBusy(true);
    try {
      const parsed = await parseReceipt({ imageBase64: asset.base64, mimeType: 'image/jpeg', categories: cats.map((x) => ({ name: x.name })), currency: settings.currency, country });
      setType(parsed.type === 'income' ? 'income' : 'expense');
      setAmount(String(parsed.amount));
      if (parsed.date) setDate(parsed.date);
      setNote(parsed.merchant || '');
      if (parsed.categoryName && cats.find((x) => x.name === parsed.categoryName)) setCategory(parsed.categoryName);
      setReceipt(asset); setFromReceipt(true); setMode('manual');
    } catch (e) { Alert.alert('Could not read receipt', e.message); }
    setScanBusy(false);
  };

  // Split helpers.
  const value = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
  const splitTotal = splits.reduce((s, r) => s + (parseFloat(String(r.amount).replace(/[^0-9.]/g, '')) || 0), 0);
  const splitRemaining = Math.round((value - splitTotal) * 100) / 100;
  const toggleSplit = () => {
    if (!splitOn) setSplits([{ category: category || cats[0]?.name || '', amount: amount || '' }]);
    setSplitOn(!splitOn);
  };
  const addSplit = () => setSplits([...splits, { category: cats[0]?.name || '', amount: splitRemaining > 0 ? String(splitRemaining) : '' }]);
  const setSplit = (i, patch) => setSplits(splits.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeSplit = (i) => setSplits(splits.filter((_, j) => j !== i));

  const handleSave = async ({ another = false } = {}) => {
    if (!value || value <= 0) { Alert.alert('Enter an amount', 'Please enter a valid amount greater than 0.'); return; }
    if (!user) { Alert.alert('Not signed in'); return; }
    if (splitOn) {
      const rows = splits.map((s) => ({ ...s, amt: parseFloat(String(s.amount).replace(/[^0-9.]/g, '')) || 0 })).filter((s) => s.amt > 0);
      if (rows.length === 0) { Alert.alert('Add split amounts', 'Give each split an amount.'); return; }
      if (Math.abs(splitTotal - value) > 0.01) { Alert.alert('Splits don’t add up', `Allocate exactly ${sym}${value}. ${splitRemaining >= 0 ? sym + splitRemaining + ' left' : 'Over by ' + sym + Math.abs(splitRemaining)}.`); return; }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBusy(true);
    try {
      let receiptUrl = null;
      if (receipt) { try { receiptUrl = await uploadReceipt(user.id, receipt); } catch { /* attach is best-effort */ } }
      // Only send receipt_url when we actually have one — the column is optional
      // and may not exist until the receipts migration is deployed.
      const rc = receiptUrl ? { receipt_url: receiptUrl } : {};

      // Build the insert target, then attempt it — falling back to the offline
      // queue on a network failure so an entry is never lost without a signal.
      // Historical-FX stamp: the USD value at entry time (null when no rate).
      const stamp = (amt) => ({ amount_usd: toUsd(amt, acctCurrency, { convert, hasRate }) });

      let insertTable;
      let insertRows;
      if (splitOn) {
        insertTable = 'expenses';
        insertRows = splits.map((s) => {
          const amt = parseFloat(String(s.amount).replace(/[^0-9.]/g, '')) || 0;
          return { user_id: user.id, amount: amt, category: s.category, account_id: accountId, note: note || null, date, ...rc, ...stamp(amt) };
        }).filter((r) => r.amount > 0);
      } else {
        insertTable = type === 'expense' ? 'expenses' : 'incomes';
        insertRows = [type === 'expense'
          ? { user_id: user.id, amount: value, category, account_id: accountId, note: note || null, date, ...rc, ...stamp(value) }
          : { user_id: user.id, amount: value, source: category, category, account_id: accountId, note: note || null, date, ...rc, ...stamp(value) }];
      }

      let queuedOffline = false;
      const { error } = await supabase.from(insertTable).insert(insertRows);
      if (error) {
        if (isNetworkError(error)) { await enqueueInsert(user.id, insertTable, insertRows); queuedOffline = true; }
        else throw error;
      }

      if (recurring && !queuedOffline) {
        await supabase.from('recurring_transactions').insert({
          user_id: user.id, type, amount: value, description: note || category, category,
          frequency: 'monthly', next_due: advanceDate(date, 'monthly'), is_active: true,
        }).then(({ error: rErr }) => { if (rErr) console.warn(rErr.message); });
      }

      // Learn merchant→category from this entry so future captures auto-fill.
      if (!splitOn && type === 'expense' && note && category) rememberRule(user.id, note, category);

      setBusy(false);
      if (queuedOffline) {
        showToast("Saved offline — we'll sync it when you're back online", { icon: 'wallet' });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onSaved && onSaved();
      }
      if (another) {
        // Keep type/account/date/category for fast repeated entry; clear the rest.
        setAmount(''); setNote(''); setQuick('');
        setReceipt(null); setFromReceipt(false); setRecurring(false);
        setSplitOn(false); setSplits([]);
        Haptics.selectionAsync().catch(() => {});
      } else {
        onClose && onClose();
      }
    } catch (e) {
      setBusy(false);
      Alert.alert('Could not save', e.message);
    }
  };

  const Mode = ({ id, icon, label }) => {
    const active = mode === id;
    return (
      <Pressable onPress={() => (id === 'import' ? setImportOpen(true) : setMode(id))} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: active ? c('primary', 0.14) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? c('primary') : 'transparent' }}>
        <Icon name={icon} size={20} color={active ? c('primary') : c('fg')} />
        <Text style={{ fontSize: 11, fontFamily: ff.med, color: active ? c('primary') : c('fgMuted'), marginTop: 5 }}>{label}</Text>
      </Pressable>
    );
  };

  if (open && !canWrite) return null; // paywall handled by the effect above

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <Animated.View style={{ transform: [{ translateY }], backgroundColor: c('surfaceElevated'), borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 24 + bottomInset, maxHeight: '92%', ...shadow(3) }}>
          {/* Handle + header are the drag-to-dismiss zone (content scrolls below). */}
          <View {...panHandlers}>
            <View style={{ width: 38, height: 4, borderRadius: 9999, backgroundColor: c('fgMuted'), opacity: 0.4, alignSelf: 'center', marginTop: 4, marginBottom: 8 }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 18, fontFamily: ff.bold, letterSpacing: -0.18, color: c('fg') }}>Add transaction</Text>
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={18} color={c('fgMuted')} />
              </Pressable>
            </View>
          </View>

          {/* Capture modes */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <Mode id="manual" icon="pencil" label="Manual" />
            <Mode id="scan" icon="camera" label="Scan receipt" />
            <Mode id="import" icon="receipt" label="Import file" />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 4 }}>
            {mode === 'scan' ? (
              <View style={{ gap: 12, paddingVertical: 6 }}>
                <Text style={{ fontSize: 13, color: c('fgMuted'), lineHeight: 19 }}>Snap or choose a receipt photo. SafeSpend reads the total, date and merchant and fills the form for you.</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Button block icon="camera" onPress={() => scan(true)} disabled={scanBusy}>Take photo</Button></View>
                  <View style={{ flex: 1 }}><Button block variant="outline" icon="film" onPress={() => scan(false)} disabled={scanBusy}>Gallery</Button></View>
                </View>
                {scanBusy ? <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}><ActivityIndicator color={c('primary')} /><Text style={{ fontSize: 12, color: c('fgMuted') }}>Reading receipt…</Text></View> : null}
              </View>
            ) : (
              <>
                {/* Natural-language quick add */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Input leading="sparkles" placeholder="Quick add — e.g. coffee 4.50" value={quick} onChange={setQuick} /></View>
                  <Pressable onPress={applyQuick} disabled={!quick.trim()} style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: R.input, backgroundColor: quick.trim() ? c('primary') : c('surfaceSecondary') }}>
                    <Text style={{ fontSize: 13, fontFamily: ff.semi, color: quick.trim() ? '#fff' : c('fgMuted') }}>Add</Text>
                  </Pressable>
                </View>

                {fromReceipt ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: c('income', 0.12) }}>
                    <Icon name="sparkles" size={15} color={c('income')} />
                    <Text style={{ flex: 1, fontSize: 12, color: c('income') }}>Filled from your receipt — check the details below.</Text>
                  </View>
                ) : null}

                {/* Type toggle */}
                <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c('surfaceSecondary'), borderRadius: 11 }}>
                  {['expense', 'income'].map((t) => {
                    const active = type === t;
                    const activeBg = t === 'expense' ? c('expense') : c('income');
                    return (
                      <Pressable key={t} onPress={() => setType(t)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={t === 'expense' ? 'Expense' : 'Income'} style={[{ flex: 1, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, active && { backgroundColor: activeBg }]}>
                        <Text style={{ fontSize: 13, fontFamily: ff.semi, color: active ? '#fff' : c('fgMuted') }}>{t === 'expense' ? '− Expense' : '+ Income'}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Amount */}
                <View>
                  <Text style={styleLabel()}>Amount</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: c('input'), borderWidth: 1, borderColor: c('border'), borderRadius: R.input }}>
                    <Text style={[num(500), { fontSize: 24, color: c('fgMuted') }]}>{sym}</Text>
                    <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={c('fgMuted')} keyboardType="decimal-pad" style={[num(700), { flex: 1, fontSize: 28, color: c('fg'), padding: 0, letterSpacing: -0.28 }]} />
                  </View>
                </View>

                {/* Account picker */}
                {accounts.length > 0 ? (
                  <View>
                    <Text style={styleLabel()}>Account</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {accounts.map((a) => {
                        const active = accountId === a.id;
                        return (
                          <Pressable key={a.id} onPress={() => setAccountId(a.id)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${a.name} account`} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? c('primary', 0.12) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? c('primary') : 'transparent' }}>
                            <Text style={{ fontSize: 13, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }}>{a.name}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Category grid (hidden while splitting) */}
                {!splitOn ? (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={[styleLabel(), { marginBottom: 0 }]}>Category</Text>
                      {note.trim().length > 2 ? (
                        <Pressable onPress={suggestCategory} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Icon name="sparkles" size={13} color={c('primary')} />
                          <Text style={{ fontSize: 12, fontFamily: ff.med, color: c('primary') }}>{aiBusy ? 'Thinking…' : 'Suggest'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {shownCats.map((cat) => {
                        const active = category === cat.name;
                        const col = hsl(cat.color);
                        return (
                          <Pressable key={cat.id || cat.name} onPress={() => setCategory(cat.name)} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ width: '31.5%', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: active ? alpha(col, 0.13) : c('surfaceSecondary'), borderWidth: 1, borderColor: active ? col : 'transparent', borderRadius: 11, alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: alpha(col, 0.2), alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name={cat.icon} size={16} color={col} />
                            </View>
                            <Text style={{ fontSize: 11, fontFamily: ff.med, color: active ? c('fg') : c('fgMuted') }} numberOfLines={1}>{cat.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {cats.length > 6 ? (
                      <Pressable onPress={() => setShowAllCats((v) => !v)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, marginTop: 4 }}>
                        <Text style={{ fontSize: 12, fontFamily: ff.med, color: c('primary') }}>{showAllCats ? 'Show less' : `Show all ${cats.length}`}</Text>
                        <Icon name={showAllCats ? 'chevronUp' : 'chevronDown'} size={14} color={c('primary')} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  /* Split allocations */
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styleLabel(), { marginBottom: 0 }]}>Split across categories</Text>
                      <Text style={{ fontSize: 11, color: splitRemaining === 0 ? c('income') : c('warning') }}>{splitRemaining === 0 ? 'Balanced' : `${sym}${Math.abs(splitRemaining)} ${splitRemaining > 0 ? 'left' : 'over'}`}</Text>
                    </View>
                    {splits.map((s, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
                          {cats.map((cat) => (
                            <Pressable key={cat.id || cat.name} onPress={() => setSplit(i, { category: cat.name })} style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 9999, backgroundColor: s.category === cat.name ? c('primary') : c('surfaceSecondary') }}>
                              <Text style={{ fontSize: 12, color: s.category === cat.name ? '#fff' : c('fg') }}>{cat.name}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                        <TextInput value={String(s.amount)} onChangeText={(v) => setSplit(i, { amount: v })} placeholder="0" placeholderTextColor={c('fgMuted')} keyboardType="decimal-pad" style={[num(600), { width: 68, fontSize: 15, color: c('fg'), backgroundColor: c('input'), borderWidth: 1, borderColor: c('border'), borderRadius: 9, paddingHorizontal: 8, paddingVertical: 8, textAlign: 'right' }]} />
                        {splits.length > 1 ? <Pressable onPress={() => removeSplit(i)} hitSlop={6}><Icon name="x" size={16} color={c('fgMuted')} /></Pressable> : null}
                      </View>
                    ))}
                    <Pressable onPress={addSplit} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
                      <Icon name="plus" size={15} color={c('primary')} /><Text style={{ fontSize: 13, fontFamily: ff.med, color: c('primary') }}>Add split</Text>
                    </Pressable>
                  </View>
                )}

                <DateField label="Date" value={date} onChange={setDate} />
                <Input label="Note" placeholder="What was it for?" value={note} onChange={setNote} />

                {/* Options */}
                {type === 'expense' ? (
                  <OptionToggle label="Split across categories" hint="Divide this amount between categories" on={splitOn} onPress={toggleSplit} />
                ) : null}
                <OptionToggle label="Repeat monthly" hint="Also create a recurring rule" on={recurring} onPress={() => setRecurring(!recurring)} />

                <Button block size="lg" variant={type === 'expense' ? 'destructive' : 'primary'} icon="check" onPress={() => handleSave()} disabled={busy}>
                  {busy ? 'Saving…' : `Save ${type}`}
                </Button>
                <Pressable onPress={() => handleSave({ another: true })} disabled={busy} hitSlop={6} style={{ alignItems: 'center', paddingVertical: 6, marginTop: -4 }}>
                  <Text style={{ fontSize: 13, fontFamily: ff.med, color: c('primary') }}>Save & add another</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} onDone={() => { onSaved && onSaved(); onClose && onClose(); }} categories={catData?.expense || []} currency={settings.currency} country={country} bottomInset={bottomInset} />
    </Modal>
  );
}

// Function (not a const) so c() is read at render — survives theme switches.
const styleLabel = () => ({ fontSize: 11, fontFamily: ff.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: c('fgMuted'), marginBottom: 6 });

function OptionToggle({ label, hint, on, onPress }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 1 }}>{hint}</Text> : null}
      </View>
      <Toggle on={on} onPress={onPress} />
    </View>
  );
}
