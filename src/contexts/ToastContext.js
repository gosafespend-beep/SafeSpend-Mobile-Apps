import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { c, ff, shadow } from '../theme/tokens';
import { Icon } from '../components';

const ToastContext = createContext({ show: () => {} });

/**
 * Global toast/snackbar. One toast at a time, bottom of screen above the tab
 * bar. Non-blocking success/undo feedback — Alert stays reserved for
 * destructive confirmations.
 *
 *   const { show } = useToast();
 *   show('Saved');
 *   show('Transaction deleted', { action: 'Undo', onAction: restore });
 */
export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null); // { message, icon, action, onAction }
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(hideTimer.current);
    Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback((message, { icon = 'check', action, onAction, duration = 2600 } = {}) => {
    clearTimeout(hideTimer.current);
    setToast({ message, icon, action, onAction });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    // Undo toasts linger a little longer so the action is actually reachable.
    hideTimer.current = setTimeout(hide, action ? Math.max(duration, 4000) : duration);
  }, [anim, hide]);

  const runAction = () => {
    const fn = toast?.onAction;
    hide();
    if (fn) fn();
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute', left: 14, right: 14, bottom: 96 + insets.bottom, zIndex: 60,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 13, backgroundColor: c('surfaceElevated'), borderWidth: 1, borderColor: c('border'), ...shadow(3) }}>
            <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: c('income', 0.16), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={toast.icon} size={14} color={c('income')} stroke={2.4} />
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontFamily: ff.med, color: c('fg') }} numberOfLines={2}>{toast.message}</Text>
            {toast.action ? (
              <Pressable onPress={runAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={toast.action}>
                <Text style={{ fontSize: 13, fontFamily: ff.semi, color: c('primary') }}>{toast.action}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
