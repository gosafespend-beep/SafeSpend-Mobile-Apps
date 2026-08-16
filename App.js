import React, { useCallback } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from './src/contexts/ToastContext';
import { AttentionProvider } from './src/contexts/AttentionContext';
import { FxProvider } from './src/contexts/FxContext';
import { EntitlementProvider } from './src/contexts/EntitlementContext';
import { CelebrationProvider } from './src/contexts/CelebrationContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initErrorReporting } from './src/lib/errorReporting';

initErrorReporting(); // no-op until a Sentry DSN is set
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Require the TTFs directly (NOT the package index): the @expo-google-fonts
// index.js requires EVERY weight + italics (~5 MB of unused fonts in the APK,
// since Metro can't tree-shake CommonJS). Direct requires bundle only these 9.
const Inter_300Light = require('@expo-google-fonts/inter/Inter_300Light.ttf');
const Inter_400Regular = require('@expo-google-fonts/inter/Inter_400Regular.ttf');
const Inter_500Medium = require('@expo-google-fonts/inter/Inter_500Medium.ttf');
const Inter_600SemiBold = require('@expo-google-fonts/inter/Inter_600SemiBold.ttf');
const Inter_700Bold = require('@expo-google-fonts/inter/Inter_700Bold.ttf');
const JetBrainsMono_400Regular = require('@expo-google-fonts/jetbrains-mono/JetBrainsMono_400Regular.ttf');
const JetBrainsMono_500Medium = require('@expo-google-fonts/jetbrains-mono/JetBrainsMono_500Medium.ttf');
const JetBrainsMono_600SemiBold = require('@expo-google-fonts/jetbrains-mono/JetBrainsMono_600SemiBold.ttf');
const JetBrainsMono_700Bold = require('@expo-google-fonts/jetbrains-mono/JetBrainsMono_700Bold.ttf');
import { c, currentThemeMode } from './src/theme/tokens';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { SettingsProvider, useSettings } from './src/contexts/SettingsContext';

// Status-bar icon color follows the active theme (re-renders on themeVersion).
function ThemedStatusBar() {
  useSettings();
  return <StatusBar style={currentThemeMode() === 'light' ? 'dark' : 'light'} />;
}
import { AppLockProvider } from './src/contexts/AppLockContext';
import { RefreshProvider } from './src/contexts/RefreshContext';
import { PeriodProvider } from './src/contexts/PeriodContext';
import { RegionProvider } from './src/contexts/RegionContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: c('bg') }} onLayout={onLayout}>
          <RegionProvider>
          <AuthProvider>
            <SettingsProvider>
              <ThemedStatusBar />
              <AppLockProvider>
                <RefreshProvider>
                  <PeriodProvider>
                    <ToastProvider>
                      <CelebrationProvider>
                        <FxProvider>
                          <AttentionProvider>
                            <EntitlementProvider>
                              <RootNavigator />
                            </EntitlementProvider>
                          </AttentionProvider>
                        </FxProvider>
                      </CelebrationProvider>
                    </ToastProvider>
                  </PeriodProvider>
                </RefreshProvider>
              </AppLockProvider>
            </SettingsProvider>
          </AuthProvider>
          </RegionProvider>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
