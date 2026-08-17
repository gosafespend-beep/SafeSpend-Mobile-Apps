import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, BackHandler, ActivityIndicator, RefreshControl, Alert, AppState, Linking, Modal, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, useNavigation, useIsFocused } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { c, currentThemeMode } from '../theme/tokens';
import { Header, TabBar, Fab, Icon } from '../components';
import ProductTour from '../components/ProductTour';
import Coachmark from '../components/Coachmark';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useEntitlement } from '../contexts/EntitlementContext';
import { useCelebration } from '../contexts/CelebrationContext';
import { useAppLock } from '../contexts/AppLockContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useToast } from '../contexts/ToastContext';
import { useAttention } from '../contexts/AttentionContext';
import { useFx } from '../contexts/FxContext';
import { supabase } from '../lib/supabase';
import { processDueRecurring } from '../lib/recurring';
import { duplicateLastTransaction } from '../lib/dataManagement';
import { syncNotifications, checkBudgetAlerts, cancelActivationNudge } from '../lib/notifications';
import { checkProactiveAlerts } from '../lib/proactive';
import { flushQueue } from '../lib/writeQueue';
import { track, flushAnalytics } from '../lib/analytics';
import { haptics } from '../lib/haptics';

import DashboardScreen from '../screens/DashboardScreen';
import LogScreen from '../screens/LogScreen';
import BudgetScreen from '../screens/BudgetScreen';
import ReportsScreen from '../screens/ReportsScreen';
import MoreScreen from '../screens/MoreScreen';
import AccountsScreen from '../screens/AccountsScreen';
import AccountDetailScreen from '../screens/AccountDetailScreen';
import GoalsScreen from '../screens/GoalsScreen';
import GoalDetailScreen from '../screens/GoalDetailScreen';
import DebtScreen from '../screens/DebtScreen';
import DebtDetailScreen from '../screens/DebtDetailScreen';
import BillCalendarScreen from '../screens/BillCalendarScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import PaywallScreen from '../screens/PaywallScreen';
import StatesScreen from '../screens/StatesScreen';
import SearchScreen from '../screens/SearchScreen';
import RecurringScreen from '../screens/RecurringScreen';
import NetWorthScreen from '../screens/NetWorthScreen';
import AnnualBudgetScreen from '../screens/AnnualBudgetScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import CoachScreen from '../screens/CoachScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import AuthScreen from '../screens/AuthScreen';
import MFAScreen from '../screens/MFAScreen';
import SetNewPasswordScreen from '../screens/SetNewPasswordScreen';
import LockScreen from '../screens/LockScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import WelcomeScreen, { WELCOME_SEEN_KEY, PRE_CURRENCY_KEY, INTENT_KEY } from '../screens/WelcomeScreen';
import AttentionScreen from '../screens/AttentionScreen';
import AddSheet from '../screens/AddSheet';
import ImportMessageSheet from '../sheets/ImportMessageSheet';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Shell — custom app chrome for one screen: Header on top, and (by default)
 * the screen's own ScrollView with pull-to-refresh. Every screen owning its
 * scroll container means scroll positions survive tab switches and lists can
 * be virtualized per-screen (pass scroll={false} for self-scrolling screens).
 */
function Shell({ title, showLogo = false, back = false, fabClearance = false, scroll = true, children }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { bump } = useRefresh();
  const { count: attentionCount } = useAttention();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    bump(); // hooks refetch in place
    setTimeout(() => { setRefreshing(false); haptics.success(); }, 900);
  }, [bump]);

  return (
    <View style={{ flex: 1, backgroundColor: c('bg') }}>
      <Header
        title={title}
        showLogo={showLogo}
        onBack={back ? () => navigation.goBack() : null}
        topInset={insets.top}
        onProfile={() => navigation.navigate('profile')}
        onBell={() => navigation.navigate('attention')}
        bellCount={attentionCount}
      />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          /*
           * The bottom inset has to be added, not assumed. On a gesture-nav
           * Android device the system bar occupies the bottom ~24-48dp of the
           * screen and swallows taps aimed at anything under it; iOS reserves
           * ~34pt for the home indicator. A fixed 24 puts the last button of a
           * screen inside that strip, so the tap goes to the OS instead of the
           * app -- which reads to the user as the button being broken.
           */
          contentContainerStyle={{ flexGrow: 1, paddingBottom: (fabClearance ? 96 : 24) + insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c('primary')} colors={[c('primary')]} />}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </View>
  );
}

/** The five bottom tabs + FAB + AddSheet. */
function TabsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { bump } = useRefresh();
  const { show } = useToast();
  const { requireWrite } = useEntitlement();
  const { celebrate } = useCelebration();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addMode, setAddMode] = useState(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [coachSeen, setCoachSeen] = useState(true); // assume seen until AsyncStorage says otherwise

  // First-run coachmark on the FAB — the "show, don't tell" nudge to log a txn.
  useEffect(() => {
    AsyncStorage.getItem('pref_coach_fab_seen').then((v) => { if (v == null) setCoachSeen(false); }).catch(() => {});
  }, []);
  const dismissCoach = useCallback(() => {
    setCoachSeen(true);
    AsyncStorage.setItem('pref_coach_fab_seen', 'true').catch(() => {});
  }, []);

  // Fire once when the user logs their very first transaction: cancel the
  // "come back and finish" nudge and record the activation event.
  const onFirstSaveCheck = useCallback(async () => {
    try {
      const logged = await AsyncStorage.getItem('first_txn_logged');
      if (logged == null) {
        await AsyncStorage.setItem('first_txn_logged', 'true');
        cancelActivationNudge();
        track('first_transaction');
        celebrate('First transaction logged! 🎉'); // the habit begins
      }
    } catch { /* best-effort */ }
  }, []);

  // Deep links: launcher shortcuts (safespend://add|scan) open the Add sheet, and
  // a shared transaction message (Messages → Share → SafeSpend, rewritten natively
  // to safespend://message?text=…) opens the Import-from-message sheet, prefilled.
  useEffect(() => {
    const handle = (url) => {
      if (!url) return;
      const action = (url.split('://')[1] || '').split(/[/?#]/)[0];
      if (action === 'add' || action === 'scan') {
        setAddMode(action === 'scan' ? 'scan' : undefined);
        setSheetOpen(true);
      } else if (action === 'message') {
        const m = url.match(/[?&]text=([^&]*)/);
        let text = '';
        try { text = m ? decodeURIComponent(m[1]) : ''; } catch { text = m ? m[1] : ''; }
        setImportText(text);
        setImportOpen(true);
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // Android hardware back inside the tabs: close the add sheet, else return to
  // Home before letting the OS exit the app. Gated on isFocused — native-stack
  // keeps TabsScreen mounted underneath pushed screens (account/goal/txn/etc.),
  // and without this check its listener fired first (BackHandler is LIFO) and
  // swallowed the press meant for whatever screen was actually on top.
  const tabNavRef = React.useRef(null);
  const isFocused = useIsFocused();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isFocused) return false;
      if (sheetOpen) { setSheetOpen(false); return true; }
      if (activeTab !== 'home' && tabNavRef.current) { tabNavRef.current.navigate('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [sheetOpen, activeTab, isFocused]);

  // FAB long-press: instantly repeat the most recent transaction with today's date.
  const repeatLast = async () => {
    if (!session?.user) return;
    try {
      const label = await duplicateLastTransaction(session.user.id);
      if (!label) { setSheetOpen(true); return; } // nothing to repeat → open the normal add sheet
      bump();
      show(`Repeated “${label}” with today’s date`, { icon: 'plus' });
    } catch (e) {
      Alert.alert('Could not repeat', e.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c('bg') }}>
      <Tab.Navigator
        initialRouteName="home"
        backBehavior="none"
        screenOptions={{ headerShown: false }}
        screenListeners={({ navigation }) => ({
          state: (e) => {
            tabNavRef.current = navigation;
            const s = e.data.state;
            if (s) setActiveTab(s.routeNames[s.index]);
          },
        })}
        tabBar={(props) => (
          <TabBar
            active={props.state.routeNames[props.state.index]}
            onChange={(id) => props.navigation.navigate(id)}
            bottomInset={insets.bottom}
          />
        )}
      >
        <Tab.Screen name="home">
          {({ navigation }) => (
            <Shell title="Safe Spend" showLogo fabClearance>
              <DashboardScreen
                onOpenTxn={(t) => navigation.navigate('txn', { data: t })}
                onGoTab={(t) => navigation.navigate(t)}
                onAdd={() => setSheetOpen(true)}
              />
            </Shell>
          )}
        </Tab.Screen>
        <Tab.Screen name="log">
          {({ navigation }) => (
            <Shell title="Transactions" fabClearance scroll={false}>
              <LogScreen
                onOpenTxn={(t) => navigation.navigate('txn', { data: t })}
                onSearch={() => navigation.navigate('search')}
              />
            </Shell>
          )}
        </Tab.Screen>
        <Tab.Screen name="budget">
          {() => (
            <Shell title="Budget" fabClearance>
              <BudgetScreen />
            </Shell>
          )}
        </Tab.Screen>
        <Tab.Screen name="reports">
          {() => (
            <Shell title="Reports" fabClearance>
              <ReportsScreen />
            </Shell>
          )}
        </Tab.Screen>
        <Tab.Screen name="more">
          {({ navigation }) => (
            <Shell title="More">
              <MoreScreen
                onNavigate={(id) => navigation.navigate(id === 'preferences' ? 'profile' : id)}
                onSignOut={() => supabase.auth.signOut()}
              />
            </Shell>
          )}
        </Tab.Screen>
      </Tab.Navigator>
      {activeTab !== 'more' ? <Fab onPress={() => { dismissCoach(); requireWrite('add_txn', () => setSheetOpen(true)); }} onLongPress={() => requireWrite('add_txn', repeatLast)} bottom={92 + insets.bottom} /> : null}
      <Coachmark
        visible={!coachSeen && activeTab === 'home' && !sheetOpen}
        text="Tap + to log your first expense and see what’s safe to spend."
        onDismiss={dismissCoach}
        bottom={92 + insets.bottom + 60}
      />
      <AddSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setAddMode(undefined); }}
        onSaved={() => { bump(); show('Transaction saved'); onFirstSaveCheck(); }}
        bottomInset={insets.bottom}
        initialMode={addMode}
      />
      <ImportMessageSheet
        open={importOpen}
        initialText={importText}
        onClose={() => { setImportOpen(false); setImportText(''); }}
        onSaved={() => { bump(); show('Transaction saved'); onFirstSaveCheck(); }}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

/** Root stack: tabs at the bottom, sub/detail screens pushed with native transitions. */
function AppNavigator({ replayTour }) {
  const { bump } = useRefresh();
  return (
    <Stack.Navigator
      initialRouteName="tabs"
      screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: c('bg') } }}
    >
      <Stack.Screen name="tabs" component={TabsScreen} />

      {/* Feature screens */}
      <Stack.Screen name="accounts">
        {({ navigation }) => (
          <Shell title="Accounts" back>
            <AccountsScreen onOpen={(a) => navigation.navigate('account', { data: a })} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="goals">
        {({ navigation }) => (
          <Shell title="Goals" back>
            <GoalsScreen onOpen={(g) => navigation.navigate('goal', { data: g })} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="debts">
        {({ navigation }) => (
          <Shell title="Debt tracker" back>
            <DebtScreen onOpen={(d) => navigation.navigate('debt', { data: d })} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="bills">
        {() => (
          <Shell title="Bill calendar" back>
            <BillCalendarScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="categories">
        {() => (
          <Shell title="Categories" back>
            <CategoriesScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="notifs">
        {() => (
          <Shell title="Notifications" back>
            <NotificationsScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="attention">
        {({ navigation }) => (
          <Shell title="Needs attention" back>
            <AttentionScreen
              onNavigate={(r) => {
                // Tab destinations live inside the 'tabs' route; others are stack routes.
                if (['home', 'log', 'budget', 'reports', 'more'].includes(r)) navigation.navigate('tabs', { screen: r });
                else navigation.navigate(r);
              }}
            />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="profile">
        {({ navigation }) => (
          <Shell title="Profile & settings" back>
            <ProfileScreen onReplayTour={replayTour} onOpenSub={(id) => navigation.navigate(id)} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="search">
        {({ navigation }) => (
          <Shell title="Search" back>
            <SearchScreen onOpenTxn={(t) => navigation.navigate('txn', { data: t })} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="recurring">
        {() => (
          <Shell title="Recurring" back>
            <RecurringScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="networth">
        {() => (
          <Shell title="Net worth" back>
            <NetWorthScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="annual">
        {() => (
          <Shell title="Annual budget" back>
            <AnnualBudgetScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="subscriptions">
        {() => (
          <Shell title="Subscriptions" back>
            <SubscriptionsScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="coach">
        {() => (
          <Shell title="AI money coach" back scroll={false}>
            <CoachScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="paywall">
        {() => (
          <Shell title="Upgrade" back>
            <PaywallScreen />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="states">
        {() => (
          <Shell title="States gallery" back>
            <StatesScreen />
          </Shell>
        )}
      </Stack.Screen>

      {/* Detail screens */}
      <Stack.Screen name="txn">
        {({ route, navigation }) => (
          <Shell title="Transaction" back>
            <TransactionDetailScreen txn={route.params?.data} onChanged={bump} onClose={() => navigation.goBack()} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="account">
        {({ route }) => (
          <Shell title="Account" back>
            <AccountDetailScreen account={route.params?.data} onChanged={bump} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="goal">
        {({ route }) => (
          <Shell title="Goal" back>
            <GoalDetailScreen goal={route.params?.data} onChanged={bump} />
          </Shell>
        )}
      </Stack.Screen>
      <Stack.Screen name="debt">
        {({ route }) => (
          <Shell title="Debt" back>
            <DebtDetailScreen debt={route.params?.data} onChanged={bump} />
          </Shell>
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading, mfaRequired, recovery } = useAuth();
  const { settings, isOnboardingComplete, loading: settingsLoading, completeOnboarding, themeVersion } = useSettings();
  const { convert } = useFx();
  const { locked: appLocked } = useAppLock();
  const { show: showToast } = useToast();
  const { paywall, dismissPaywall, presentPaywall, canWrite, loading: entLoading } = useEntitlement();
  const signedIn = !!session;
  const [tourOpen, setTourOpen] = useState(false);

  // Post-onboarding trial offer: the first time a set-up, non-subscribed user
  // reaches the app, present the paywall (peak motivation, card-up-front model).
  // Fires once — after that the read-only banner / FAB drive them to it.
  useEffect(() => {
    if (!signedIn || !isOnboardingComplete || appLocked || entLoading || canWrite) return;
    let active = true;
    AsyncStorage.getItem('pref_trial_offered').then((seen) => {
      if (active && seen == null) {
        presentPaywall('onboarding');
        AsyncStorage.setItem('pref_trial_offered', 'true').catch(() => {});
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [signedIn, isOnboardingComplete, appLocked, entLoading, canWrite]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-auth welcome: shown before AuthScreen for brand-new users so they meet
  // the product (and pick intent + currency) before hitting a sign-up wall.
  const [welcome, setWelcome] = useState({ checked: false, seen: false, currency: null, intent: null, authMode: 'signin' });
  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet([WELCOME_SEEN_KEY, PRE_CURRENCY_KEY, INTENT_KEY])
      .then((pairs) => {
        if (!active) return;
        const map = Object.fromEntries(pairs);
        setWelcome((w) => ({ ...w, checked: true, seen: map[WELCOME_SEEN_KEY] === 'true', currency: map[PRE_CURRENCY_KEY] || null, intent: map[INTENT_KEY] || null }));
      })
      .catch(() => { if (active) setWelcome((w) => ({ ...w, checked: true })); });
    return () => { active = false; };
  }, []);
  const finishWelcome = (mode, data) => setWelcome((w) => ({ ...w, seen: true, authMode: mode || 'signin', currency: data?.currency || w.currency, intent: data?.intent || w.intent }));

  // Auto-create any recurring transactions that have come due (once per sign-in).
  const { bump } = useRefresh();

  // Replay any offline-queued writes on sign-in and whenever the app returns to
  // the foreground (a common moment for connectivity to have come back).
  useEffect(() => {
    if (!session?.user) return undefined;
    const uid = session.user.id;
    const attempt = async () => {
      const n = await flushQueue(uid).catch(() => 0);
      if (n > 0) { bump(); showToast(`Synced ${n} offline change${n === 1 ? '' : 's'}`, { icon: 'check' }); }
      flushAnalytics(); // drain any buffered events on the same connectivity moments
    };
    attempt();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') attempt(); });
    return () => sub.remove();
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    processDueRecurring(session.user.id).then((created) => {
      if (active && created > 0) bump(); // refetch in place
    }).catch(() => {});
    syncNotifications(session.user.id).catch(() => {});
    checkBudgetAlerts(session.user.id, { currency: settings.currency, convert }).catch(() => {});
    // Proactive intelligence: predicted shortfall, unusual charges, new subscriptions.
    checkProactiveAlerts(session.user.id, { currency: settings.currency, convert }).catch(() => {});
    return () => { active = false; };
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The product tour no longer auto-fires — first-run guidance is the contextual
  // FAB coachmark (see TabsScreen). The tour stays available on demand, replayed
  // from Profile ("Take the tour"), so it's a reference, not a gate.
  const dismissTour = () => { setTourOpen(false); AsyncStorage.setItem('pref_tour_seen', 'true').catch(() => {}); };
  const replayTour = () => { track('tour_open'); setTourOpen(true); };

  const handleOnboardingComplete = async ({ currency, accounts, recurringIncome, bill }) => {
    // Create the starter accounts BEFORE marking onboarding complete, so a failed
    // insert never lands the user on an empty dashboard they can't re-trigger.
    if (accounts && accounts.length && session?.user) {
      const { data: created, error } = await supabase.from('accounts').insert(
        accounts.map((a) => ({
          user_id: session.user.id,
          name: a.name,
          color: a.color,
          initial_balance: a.initial_balance,
          // The preset's real type — NOT a hardcoded 'bank'. computeBalances keys
          // liquidity and credit-sign handling off this, so getting it wrong here
          // silently corrupts Safe-to-Spend and net worth from the very first run.
          type: a.type || 'bank',
          currency, // denominate first accounts in the currency chosen at onboarding
        }))
      ).select('id');
      if (error) { showToast('Could not create your accounts — retry from Accounts.', { icon: 'x' }); }

      // Seed the recurring income + fixed bill captured during onboarding. These
      // are what make Safe-to-Spend, the forecast and the coach non-trivial on day
      // one; without them the projection is flat. Best-effort — a failure here must
      // never block finishing setup.
      const accountId = created?.[0]?.id || null;
      if (recurringIncome) {
        await supabase.from('recurring_transactions').insert({
          user_id: session.user.id,
          ...recurringIncome,
          account_id: accountId,
          is_active: true,
        }).then(({ error: e }) => { if (e && __DEV__) console.warn('[onboarding] income seed:', e.message); });
      }
      if (bill) {
        await supabase.from('bills').insert({
          user_id: session.user.id,
          ...bill,
          // Stamp the onboarding currency. bills.currency is NOT NULL DEFAULT 'USD',
          // so without this a user who chose KES (or any non-USD) has their very
          // first bill mislabelled USD, and Safe-to-Spend converts it as though the
          // amount were dollars — the same mislabelling that plagued legacy rows.
          currency,
          frequency: 'monthly',
          is_active: true,
        }).then(({ error: e }) => { if (e && __DEV__) console.warn('[onboarding] bill seed:', e.message); });
      }
    }
    await completeOnboarding(currency);
  };

  const Loading = (
    <View style={{ flex: 1, backgroundColor: c('bg'), alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={c('primary')} size="large" />
    </View>
  );

  if (authLoading) return Loading;
  if (recovery) return <SetNewPasswordScreen topInset={insets.top} />;
  if (!signedIn) {
    if (!welcome.checked) return Loading;
    if (!welcome.seen) return <WelcomeScreen onDone={finishWelcome} topInset={insets.top} />;
    return (
      <AuthScreen
        topInset={insets.top}
        initialMode={welcome.authMode}
        // Session-level only: the persisted "seen" flag stays set, so the intro
        // won't reappear on a future launch — this just undoes a misplaced tap.
        onBackToWelcome={() => setWelcome((w) => ({ ...w, seen: false }))}
      />
    );
  }
  if (mfaRequired) return <MFAScreen topInset={insets.top} />;
  if (settingsLoading) return Loading;
  if (!isOnboardingComplete) {
    // If the user came through the pre-auth welcome, currency + intent are already
    // chosen — the post-sign-up setup skips those steps and prefills them.
    return (
      <OnboardingScreen
        onComplete={handleOnboardingComplete}
        topInset={insets.top}
        initialCurrency={welcome.currency}
        intent={welcome.intent}
        fromWelcome={!!welcome.currency}
      />
    );
  }

  // Nav theme follows the app theme so transition backdrops never flash white.
  // (Recomputed every render; theme switches re-render via SettingsContext.)
  const navTheme = {
    ...DefaultTheme,
    dark: currentThemeMode() === 'dark',
    colors: {
      ...DefaultTheme.colors,
      primary: c('primary'),
      background: c('bg'),
      card: c('surface'),
      text: c('fg'),
      border: c('border'),
      notification: c('primary'),
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <AppNavigator replayTour={replayTour} />
      <ProductTour open={tourOpen} onClose={dismissTour} />
      {/* Paywall is presented as a modal from anywhere (feature gate, settings,
          the post-onboarding offer) via the entitlement context. */}
      <Modal visible={paywall.open} animationType="slide" onRequestClose={dismissPaywall} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: c('bg') }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable onPress={dismissPaywall} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={20} color={c('fgMuted')} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <PaywallScreen source={paywall.source} onClose={dismissPaywall} />
          </ScrollView>
        </View>
      </Modal>
      {/* Lock screen is overlaid on top of the live nav tree (like the paywall
          modal above) instead of replacing it via an early return — briefly
          backgrounding the app (notification shade, a permission dialog) must
          not unmount the navigation stack or an open sheet's unsaved input. */}
      <Modal visible={appLocked} animationType="none" statusBarTranslucent onRequestClose={() => {}}>
        <LockScreen topInset={insets.top} />
      </Modal>
    </NavigationContainer>
  );
}
