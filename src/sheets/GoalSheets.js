import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { FormSheet, AmountField, SwatchPicker, DateField } from '../components/FormSheet';
import { Input } from '../components';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { currencySymbol } from '../lib/format';
import { COLOR_SWATCHES, GOAL_ICONS } from './palette';
import { bumpRefresh } from '../contexts/RefreshContext';

export function AddGoalSheet({ open, onClose, onSaved, editing = null, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [start, setStart] = useState('');
  const [deadline, setDeadline] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0].value);
  const [icon, setIcon] = useState(GOAL_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (open && editing) {
      setName(editing.name || '');
      setTarget(editing.target != null ? String(editing.target) : '');
      setStart('');
      setDeadline(editing.rawDeadline || '');
      setColor(editing.color || COLOR_SWATCHES[0].value);
      setIcon(editing.icon || GOAL_ICONS[0]);
    } else if (open && !editing) {
      setName(''); setTarget(''); setStart(''); setDeadline(''); setColor(COLOR_SWATCHES[0].value); setIcon(GOAL_ICONS[0]);
    }
  }, [open, editing]);

  const save = async () => {
    const targetAmt = parseFloat(String(target).replace(/[^0-9.]/g, '')) || 0;
    if (!name.trim() || targetAmt <= 0) { Alert.alert('Check details', 'Enter a name and a target amount.'); return; }
    const deadlineVal = /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null;
    setSaving(true);
    let error;
    if (isEdit) {
      ({ error } = await supabase.from('savings_goals').update({ name: name.trim(), target_amount: targetAmt, color, icon, deadline: deadlineVal }).eq('id', editing.id));
    } else {
      const startAmt = parseFloat(String(start).replace(/[^0-9.]/g, '')) || 0;
      // Stamp the currency the amounts were actually entered in — the column is
      // NOT NULL DEFAULT 'USD', so leaving it unset mislabels every non-USD goal.
      ({ error } = await supabase.from('savings_goals').insert({
        user_id: user.id, name: name.trim(), target_amount: targetAmt, currency: settings.currency,
        current_amount: startAmt, initial_amount: startAmt, color, icon, deadline: deadlineVal, is_completed: false,
      }));
    }
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved(); onClose && onClose();
  };

  const iconOpts = GOAL_ICONS.map((i) => ({ value: i, color: i === icon ? COLOR_SWATCHES[0].color : '#2a3340', icon: i }));

  return (
    <FormSheet open={open} onClose={onClose} title={isEdit ? 'Edit goal' : 'New goal'} onSave={save} saving={saving} saveLabel={isEdit ? 'Save changes' : 'Create goal'} bottomInset={bottomInset}>
      <Input label="Goal name" placeholder="e.g. Emergency Fund" value={name} onChange={setName} />
      <AmountField label="Target amount" value={target} onChange={setTarget} symbol={currencySymbol(editing?.currency || settings.currency)} />
      {!isEdit ? <AmountField label="Already saved (optional)" value={start} onChange={setStart} symbol={currencySymbol(settings.currency)} /> : null}
      <DateField label="Deadline (optional)" value={deadline} onChange={setDeadline} optional />
      <SwatchPicker options={COLOR_SWATCHES} value={color} onChange={setColor} />
      <SwatchPicker options={iconOpts} value={icon} onChange={setIcon} />
    </FormSheet>
  );
}

export function ContributionSheet({ open, onClose, onSaved, goal, bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) { Alert.alert('Enter an amount', 'Amount must be greater than 0.'); return; }
    if (!goal?.id) { Alert.alert('No goal selected'); return; }
    setSaving(true);
    const today = todayISO();
    const { error } = await supabase.from('goal_contributions').insert({
      user_id: user.id, goal_id: goal.id, amount: amt, date: today, note: note || null,
    });
    if (error) { setSaving(false); Alert.alert('Could not save', error.message); return; }
    const { error: rpcErr } = await supabase.rpc('atomic_increment_goal_amount', { p_goal_id: goal.id, p_amount: amt });
    setSaving(false);
    if (rpcErr) { Alert.alert('Contribution saved, but balance not updated', rpcErr.message); }
    setAmount(''); setNote(''); bumpRefresh(); onSaved && onSaved(); onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title={goal ? `Add to ${goal.name}` : 'Add contribution'} onSave={save} saving={saving} saveLabel="Add contribution" bottomInset={bottomInset}>
      <AmountField label="Amount" value={amount} onChange={setAmount} symbol={currencySymbol(settings.currency)} />
      <Input label="Note (optional)" placeholder="e.g. Monthly transfer" value={note} onChange={setNote} />
    </FormSheet>
  );
}
