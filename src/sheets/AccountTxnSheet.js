import React, { useState } from 'react';
import { Alert } from 'react-native';
import { FormSheet, AmountField } from '../components/FormSheet';
import { Input } from '../components';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFx } from '../contexts/FxContext';
import { toUsd } from '../lib/fx';
import { currencySymbol } from '../lib/format';
import { bumpRefresh } from '../contexts/RefreshContext';

/** Quick deposit/withdraw recorded as an income/expense tied to one account. */
export default function AccountTxnSheet({ open, onClose, onSaved, account, mode = 'deposit', bottomInset = 0 }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { convert, hasRate } = useFx();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const isDeposit = mode === 'deposit';

  const save = async () => {
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) { Alert.alert('Enter an amount', 'Amount must be greater than 0.'); return; }
    if (!account?.id) { Alert.alert('No account selected'); return; }
    setSaving(true);
    const today = todayISO();
    const usd = toUsd(amt, account?.currency || settings.currency, { convert, hasRate });
    const row = isDeposit
      ? { user_id: user.id, account_id: account.id, amount: amt, source: 'Deposit', note: note || null, date: today, amount_usd: usd }
      : { user_id: user.id, account_id: account.id, amount: amt, category: 'Withdrawal', note: note || null, date: today, amount_usd: usd };
    const { error } = await supabase.from(isDeposit ? 'incomes' : 'expenses').insert(row);
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    setAmount(''); setNote(''); bumpRefresh(); onSaved && onSaved(); onClose && onClose();
  };

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={`${isDeposit ? 'Deposit to' : 'Withdraw from'} ${account?.name || 'account'}`}
      onSave={save}
      saving={saving}
      saveLabel={isDeposit ? 'Add deposit' : 'Add withdrawal'}
      saveVariant={isDeposit ? 'primary' : 'destructive'}
      bottomInset={bottomInset}
    >
      <AmountField label="Amount" value={amount} onChange={setAmount} symbol={currencySymbol(account?.currency || settings.currency)} />
      <Input label="Note (optional)" placeholder="What was it for?" value={note} onChange={setNote} />
    </FormSheet>
  );
}
