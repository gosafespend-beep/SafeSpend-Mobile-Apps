import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { FormSheet, SegmentField } from '../components/FormSheet';
import { c, ff } from '../theme/tokens';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { pickAndValidateBackup, importBackup } from '../lib/dataManagement';

const LABELS = {
  accounts: 'Accounts', categories: 'Categories', income_categories: 'Income categories',
  expenses: 'Expenses', incomes: 'Income', transfers: 'Transfers', budgets: 'Budgets',
  savings_goals: 'Goals', goal_contributions: 'Goal contributions', debts: 'Debts',
  debt_payments: 'Debt payments', bills: 'Bills', bill_statuses: 'Bill statuses',
  recurring_transactions: 'Recurring', assets: 'Assets', liabilities: 'Liabilities',
  networth_snapshots: 'Net-worth snapshots',
};

export default function ImportSheet({ open, onClose, bottomInset = 0 }) {
  const { user } = useAuth();
  const { bump } = useRefresh();
  const [stage, setStage] = useState('picking'); // picking | preview | importing
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('replace');

  const start = useCallback(async () => {
    setStage('picking');
    setPreview(null);
    try {
      const result = await pickAndValidateBackup();
      if (!result) { onClose && onClose(); return; }
      setPreview(result);
      setStage('preview');
    } catch (e) {
      Alert.alert('Import failed', e.message);
      onClose && onClose();
    }
  }, [onClose]);

  useEffect(() => { if (open) start(); }, [open]);

  const runImport = async () => {
    setStage('importing');
    try {
      await importBackup(user.id, preview.data, mode);
      bump();
      Alert.alert('Import complete', `Restored ${preview.total} records.`);
      onClose && onClose();
    } catch (e) {
      Alert.alert('Import failed', e.message);
      setStage('preview');
    }
  };

  const busy = stage !== 'preview';

  return (
    <FormSheet
      open={open}
      onClose={busy && stage === 'importing' ? undefined : onClose}
      title="Import backup"
      onSave={stage === 'preview' ? runImport : undefined}
      saving={busy}
      saveLabel={stage === 'importing' ? 'Importing…' : 'Import data'}
      bottomInset={bottomInset}
    >
      {stage === 'picking' ? (
        <View style={{ padding: 24, alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={c('primary')} />
          <Text style={{ fontSize: 13, color: c('fgMuted') }}>Reading file…</Text>
        </View>
      ) : null}

      {preview ? (
        <>
          {preview.exportedAt ? (
            <Text style={{ fontSize: 12, color: c('fgMuted') }}>
              Backup from {new Date(preview.exportedAt).toLocaleDateString()}
            </Text>
          ) : null}

          <SegmentField
            label="Import mode"
            options={[{ value: 'replace', label: 'Replace all' }, { value: 'merge', label: 'Merge' }]}
            value={mode}
            onChange={setMode}
          />
          <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: -6, lineHeight: 16 }}>
            {mode === 'replace'
              ? 'Deletes your current data first, then restores the backup.'
              : 'Adds and updates records from the backup, keeping your current data.'}
          </Text>

          <View style={{ borderRadius: 12, backgroundColor: c('surfaceSecondary'), overflow: 'hidden' }}>
            {Object.entries(preview.counts).map(([t, n], i) => (
              <View key={t} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c('border', 0.4) }}>
                <Text style={{ fontSize: 13, color: c('fg') }}>{LABELS[t] || t}</Text>
                <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('fgMuted') }}>{n}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 12, fontFamily: ff.semi, color: c('fg'), textAlign: 'right' }}>
            {preview.total} records total
          </Text>
        </>
      ) : null}
    </FormSheet>
  );
}
