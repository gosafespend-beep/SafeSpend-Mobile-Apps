import React, { useState } from 'react';
import { Alert } from 'react-native';
import { FormSheet } from '../components/FormSheet';
import { Input } from '../components';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { bumpRefresh } from '../contexts/RefreshContext';

export function ChangePasswordSheet({ open, onClose, onSaved, bottomInset = 0 }) {
  const { updatePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (next.length < 6) { Alert.alert('Too short', 'New password must be at least 6 characters.'); return; }
    if (next !== confirm) { Alert.alert('Mismatch', 'New passwords do not match.'); return; }
    setSaving(true);
    const { error } = await updatePassword(current, next);
    setSaving(false);
    if (error) { Alert.alert('Could not change password', error.message); return; }
    setCurrent(''); setNext(''); setConfirm('');
    Alert.alert('Done', 'Your password has been updated.');
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title="Change password" onSave={save} saving={saving} saveLabel="Update password" bottomInset={bottomInset}>
      <Input label="Current password" placeholder="••••••••" value={current} onChange={setCurrent} secure />
      <Input label="New password" placeholder="At least 6 characters" value={next} onChange={setNext} secure />
      <Input label="Confirm new password" placeholder="••••••••" value={confirm} onChange={setConfirm} secure />
    </FormSheet>
  );
}

export function EditNameSheet({ open, onClose, onSaved, initialName = '', bottomInset = 0 }) {
  const { user } = useAuth();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Enter a display name.'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, display_name: name.trim() }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    bumpRefresh(); onSaved && onSaved();
    onClose && onClose();
  };

  return (
    <FormSheet open={open} onClose={onClose} title="Edit name" onSave={save} saving={saving} saveLabel="Save" bottomInset={bottomInset}>
      <Input label="Display name" placeholder="Your name" value={name} onChange={setName} />
    </FormSheet>
  );
}
