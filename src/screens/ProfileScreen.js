import React, { useState } from 'react';
import { View, Text, Pressable, Linking, Alert, Image, ActivityIndicator, Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { c, ff, glow, alpha } from '../theme/tokens';
import { Card, Badge, SectionHeader, Toggle, Icon } from '../components';
import { useProfileInfo } from '../hooks/useProfileInfo';
import { useAppLock, BIOMETRIC_LABEL } from '../contexts/AppLockContext';
import { useSettings, budgetPeriodLabel } from '../contexts/SettingsContext';
import { ChangePasswordSheet, EditNameSheet } from '../sheets/ProfileSheets';
import CurrencySheet from '../sheets/CurrencySheet';
import CountrySheet from '../sheets/CountrySheet';
import { useRegion } from '../contexts/RegionContext';
import { countryLabel } from '../lib/countries';
import SessionsSheet from '../sheets/SessionsSheet';
import MFASetupSheet from '../sheets/MFASetupSheet';
import BudgetPeriodSheet from '../sheets/BudgetPeriodSheet';
import SocialAccountsSheet from '../sheets/SocialAccountsSheet';
import ImportSheet from '../sheets/ImportSheet';
import ActionSheet from '../components/ActionSheet';
import { useAuth } from '../contexts/AuthContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import { useRefresh } from '../contexts/RefreshContext';
import { exportJSON, exportTransactionsCSV, deleteAllData, uploadAvatar, pickAndValidateCSV, importCSVTransactions } from '../lib/dataManagement';

const PRIVACY_URL = 'https://gosafespend.com/privacy-policy';
const TERMS_URL = 'https://gosafespend.com/terms-of-service';
const SUPPORT_EMAIL = 'support@gosafespend.com';

function SettingRow({ label, value, last, danger, arrow, hint, hintColor, icon, iconColor, onPress }) {
  const tint = danger ? c('expense') : (iconColor || c('fgMuted'));
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: last ? 0 : 1, borderBottomColor: c('border', 0.4) }}>
      {icon ? (
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: alpha(tint, 0.14), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={16} color={tint} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: ff.med, color: danger ? c('expense') : c('fg') }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 11, color: hintColor || c('fgMuted'), marginTop: 2 }}>{hint}</Text> : null}
      </View>
      {value ? <Text style={{ fontSize: 13, color: c('fgMuted') }} numberOfLines={1}>{value}</Text> : null}
      {arrow ? <Icon name="chevronRight" size={16} color={c('fgMuted')} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: c('surfaceHover') }}>{inner}</Pressable>;
}

/** Inline toggle row with a leading icon — matches SettingRow's look. */
function ToggleRow({ label, hint, icon, iconColor, on, onPress, last }) {
  const tint = iconColor || c('fgMuted');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: last ? 0 : 1, borderBottomColor: c('border', 0.4) }}>
      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: alpha(tint, 0.14), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={16} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: ff.med, color: c('fg') }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 11, color: c('fgMuted'), marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Toggle on={on} onPress={onPress} />
    </View>
  );
}

const PROVIDER_LABEL = { email: 'Email & password', google: 'Google' };

export default function ProfileScreen({ onReplayTour, onOpenSub }) {
  const { name, email, initials, avatarUrl, plan, reload } = useProfileInfo();
  const { enabled: lockEnabled, supported: lockSupported, setEnabled: setLockEnabled } = useAppLock();
  const { settings, updateSetting, setShowCents, setStartOfWeek, setHideBalances } = useSettings();
  const { user, provider, isEmailVerified, resendVerification, deleteAccount } = useAuth();
  const { presentPaywall } = useEntitlement();
  const { country, setCountry } = useRegion();
  const [countryOpen, setCountryOpen] = useState(false);
  const { bump } = useRefresh();
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Read the real native versionName (correct in production; `Constants.expoConfig`
  // embeds a stale snapshot in release builds — it was showing an old version).
  const version = Application.nativeApplicationVersion || Constants.expoConfig?.version || '2.0.1';

  const runExport = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(user.id); } catch (e) { Alert.alert('Export failed', e.message); }
    setBusy(false);
  };

  const changeAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to change your picture.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    try { await uploadAvatar(user.id, res.assets[0]); reload(); }
    catch (e) { Alert.alert('Upload failed', e.message); }
    setBusy(false);
  };

  const importCSV = async () => {
    if (busy) return;
    let preview;
    try { preview = await pickAndValidateCSV(); }
    catch (e) { Alert.alert('Could not read CSV', e.message); return; }
    if (!preview) return; // cancelled
    Alert.alert(
      'Import transactions?',
      `Found ${preview.total} transactions (${preview.income} income, ${preview.expense} expense). Add them to your account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import', onPress: async () => {
            setBusy(true);
            try { await importCSVTransactions(user.id, preview.rows); bump(); Alert.alert('Imported', `Added ${preview.total} transactions.`); }
            catch (e) { Alert.alert('Import failed', e.message); }
            setBusy(false);
          },
        },
      ]
    );
  };

  const resend = async () => {
    const { error } = await resendVerification();
    Alert.alert(error ? 'Could not send' : 'Email sent', error ? error.message : 'Check your inbox for the verification link.');
  };

  const confirmDeleteData = () =>
    Alert.alert('Delete all data?', 'This permanently removes all your accounts, transactions, budgets, goals and debts. Your login stays. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything', style: 'destructive', onPress: async () => {
          setBusy(true);
          try { await deleteAllData(user.id); bump(); Alert.alert('Done', 'All financial data deleted.'); }
          catch (e) { Alert.alert('Failed', e.message); }
          setBusy(false);
        },
      },
    ]);

  const confirmDeleteAccount = () =>
    Alert.alert('Delete account?', 'This permanently deletes your account and all data. You will be signed out and cannot recover it. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete my account', style: 'destructive', onPress: async () => {
          setBusy(true);
          const { error, warning } = await deleteAccount();
          setBusy(false);
          if (error) Alert.alert('Failed', error.message);
          // The account is gone either way, but a store subscription is not --
          // say so before the sign-out navigates away, or they keep paying.
          else if (warning) Alert.alert('Account deleted', warning);
          // On success the auth listener signs the user out and navigates away.
        },
      },
    ]);

  // Option pickers share one ActionSheet (Alert menus cap at 3 buttons on Android).
  const [picker, setPicker] = useState(null); // 'theme' | 'dateFormat' | 'startOfWeek'
  const PICKERS = {
    theme: {
      title: 'Appearance',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'System default', value: 'system' },
      ],
      current: settings.theme || 'dark',
      apply: (v) => updateSetting({ theme: v }),
    },
    dateFormat: {
      title: 'Date format',
      options: [
        { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
        { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
        { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
      ],
      current: settings.dateFormat,
      apply: (v) => updateSetting({ dateFormat: v }),
    },
    startOfWeek: {
      title: 'Start of week',
      options: [
        { label: 'Sunday', value: 'sunday' },
        { label: 'Monday', value: 'monday' },
      ],
      current: settings.startOfWeek || 'sunday',
      apply: (v) => setStartOfWeek(v),
    },
  };
  const activePicker = picker ? PICKERS[picker] : null;

  const pickDateFormat = () => setPicker('dateFormat');
  const pickStartOfWeek = () => setPicker('startOfWeek');
  const pickTheme = () => setPicker('theme');
  const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' }[settings.theme] || 'Dark';

  const contactSupport = () =>
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('SafeSpend support')}&body=${encodeURIComponent(`\n\n—\nApp version ${version}`)}`)
      .catch(() => Alert.alert('No email app', `Reach us at ${SUPPORT_EMAIL}`));
  const shareApp = () =>
    Share.share({ message: 'I’m using SafeSpend to budget and always know what’s safe to spend. Check it out: https://gosafespend.com' }).catch(() => {});

  return (
    <View style={{ padding: 14, paddingBottom: 28, gap: 10 }}>
      {/* Avatar */}
      <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={changeAvatar} accessibilityLabel="Change profile photo">
          <View style={[{ width: 60, height: 60, borderRadius: 20, backgroundColor: c('primary'), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, glow(c('primary'), 0.5)]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: 60, height: 60 }} />
            ) : (
              <Text style={{ fontFamily: ff.bold, fontSize: 22, color: '#fff' }}>{initials}</Text>
            )}
            {busy ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : null}
          </View>
          <View style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: c('surfaceSecondary'), borderWidth: 2, borderColor: c('surface'), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pencil" size={11} color={c('fg')} />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: ff.semi, color: c('fg') }}>{name}</Text>
          <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }}>{email}</Text>
          {plan ? (
            <View style={{ marginTop: 8 }}>
              <Badge variant={plan === 'Free' ? 'default' : 'primary'} icon={plan === 'Free' ? undefined : 'sparkles'}>{plan}</Badge>
            </View>
          ) : null}
        </View>
        <Pressable onPress={() => setNameOpen(true)} accessibilityLabel="Edit name" style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pencil" size={16} color={c('fg')} />
        </Pressable>
      </View>

      <SectionHeader title="Account" />
      <Card padded={false}>
        <SettingRow icon="userCircle" iconColor={c('primary')} label="Display name" value={name} arrow onPress={() => setNameOpen(true)} />
        <SettingRow
          icon="mail" iconColor="#60a5fa"
          label="Email"
          value={email}
          hint={isEmailVerified ? 'Verified' : 'Not verified'}
          hintColor={isEmailVerified ? c('income') : c('expense')}
        />
        {!isEmailVerified ? (
          <SettingRow icon="mail" iconColor={c('warning')} label="Resend verification email" arrow onPress={resend} />
        ) : null}
        <SettingRow icon="key" iconColor="#a78bfa" label="Sign-in method" value={PROVIDER_LABEL[provider] || provider} />
        <SettingRow icon="lock" iconColor="#a78bfa" label="Change password" arrow last onPress={() => setPwOpen(true)} />
      </Card>

      <SectionHeader title="Preferences" />
      <Card padded={false}>
        <SettingRow icon="sun" iconColor={c('savings')} label="Appearance" value={themeLabel} arrow onPress={pickTheme} />
        {onOpenSub ? <SettingRow icon="bell" iconColor={c('warning')} label="Notifications" arrow onPress={() => onOpenSub('notifs')} /> : null}
        <SettingRow icon="dollarSign" iconColor={c('income')} label="Currency" value={settings.currency} arrow onPress={() => setCurrencyOpen(true)} />
        <SettingRow icon="mapPin" iconColor="#f472b6" label="Country / region" value={countryLabel(country)} arrow onPress={() => setCountryOpen(true)} />
        <SettingRow icon="calendar" iconColor="#60a5fa" label="Date format" value={settings.dateFormat} arrow onPress={pickDateFormat} />
        <SettingRow icon="calendar" iconColor="#60a5fa" label="Start of week" value={settings.startOfWeek === 'monday' ? 'Monday' : 'Sunday'} arrow onPress={pickStartOfWeek} />
        <SettingRow
          icon="barChart" iconColor={c('primary')}
          label="Budget period"
          value={budgetPeriodLabel(settings.budgetStartMonth, settings.budgetStartYear).split(' – ')[0]}
          arrow
          onPress={() => setBudgetOpen(true)}
        />
        <ToggleRow icon="lock" iconColor="#a78bfa" label="Hide amounts" hint="Mask balances for privacy in public" on={settings.hideBalances} onPress={() => setHideBalances(!settings.hideBalances)} />
        <ToggleRow icon="dollarSign" iconColor={c('income')} label="Show cents" hint="Display decimal amounts" on={settings.showCents} onPress={() => setShowCents(!settings.showCents)} last={!lockSupported} />
        {lockSupported ? (
          <ToggleRow icon="shield" iconColor={c('primary')} label="App lock" hint={`Require ${BIOMETRIC_LABEL} to open`} on={lockEnabled} onPress={() => setLockEnabled(!lockEnabled)} last />
        ) : null}
      </Card>

      <SectionHeader title="Security" />
      <Card padded={false}>
        <SettingRow icon="shield" iconColor={c('primary')} label="Two-factor authentication" arrow onPress={() => setMfaOpen(true)} />
        <SettingRow icon="userCircle" iconColor="#60a5fa" label="Connected accounts" arrow onPress={() => setSocialOpen(true)} />
        <SettingRow icon="smartphone" iconColor="#a78bfa" label="Active sessions" arrow last onPress={() => setSessionsOpen(true)} />
      </Card>

      <SectionHeader title="Data" />
      <Card padded={false}>
        <SettingRow icon="share" iconColor={c('income')} label="Export backup (JSON)" arrow onPress={() => runExport(exportJSON)} />
        <SettingRow icon="share" iconColor={c('income')} label="Export transactions (CSV)" arrow onPress={() => runExport(exportTransactionsCSV)} />
        <SettingRow icon="receipt" iconColor="#60a5fa" label="Import backup" arrow onPress={() => setImportOpen(true)} />
        <SettingRow icon="receipt" iconColor="#60a5fa" label="Import transactions (CSV)" arrow onPress={importCSV} />
        <SettingRow icon="trash" label="Delete all data" danger arrow onPress={confirmDeleteData} />
        <SettingRow icon="trash" label="Delete account" danger arrow last onPress={confirmDeleteAccount} />
      </Card>

      <SectionHeader title="Support" />
      <Card padded={false}>
        <SettingRow icon="mail" iconColor="#60a5fa" label="Help & support" arrow onPress={contactSupport} />
        <SettingRow icon="share" iconColor={c('primary')} label="Share SafeSpend" arrow onPress={shareApp} />
        <SettingRow icon="sparkles" iconColor={c('savings')} label="Manage subscription" value={plan && plan !== 'Free' ? plan : undefined} arrow last onPress={() => presentPaywall('settings')} />
      </Card>

      <SectionHeader title="About" />
      <Card padded={false}>
        {onReplayTour ? <SettingRow icon="zap" iconColor={c('savings')} label="Replay product tour" arrow onPress={onReplayTour} /> : null}
        <SettingRow icon="smartphone" iconColor={c('fgMuted')} label="Version" value={version} />
        <SettingRow icon="lock" iconColor={c('fgMuted')} label="Privacy policy" arrow onPress={() => Linking.openURL(PRIVACY_URL)} />
        <SettingRow icon="book" iconColor={c('fgMuted')} label="Terms of service" arrow last onPress={() => Linking.openURL(TERMS_URL)} />
      </Card>

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
      <EditNameSheet open={nameOpen} initialName={name} onClose={() => setNameOpen(false)} onSaved={reload} />
      <CurrencySheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} />
      <CountrySheet open={countryOpen} current={country} onSelect={setCountry} onClose={() => setCountryOpen(false)} />
      <SessionsSheet open={sessionsOpen} onClose={() => setSessionsOpen(false)} />
      <MFASetupSheet open={mfaOpen} onClose={() => setMfaOpen(false)} />
      <BudgetPeriodSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} />
      <SocialAccountsSheet open={socialOpen} onClose={() => setSocialOpen(false)} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
      <ActionSheet
        open={!!activePicker}
        title={activePicker?.title}
        onClose={() => setPicker(null)}
        options={activePicker ? activePicker.options.map((o) => ({
          label: o.label,
          selected: o.value === activePicker.current,
          onPress: () => activePicker.apply(o.value),
        })) : []}
      />
    </View>
  );
}
