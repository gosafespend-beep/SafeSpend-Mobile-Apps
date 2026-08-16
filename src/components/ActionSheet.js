import React from 'react';
import { View, Text, Pressable, Modal, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { c, alpha, ff, shadow } from '../theme/tokens';
import { Icon } from './index';
import { useSheetDrag } from './useSheetDrag';

/**
 * Themed bottom action sheet — replaces Alert.alert() used as a context menu.
 * (Android caps Alert at 3 buttons, silently dropping the rest; this has no cap
 * and matches the app's sheet design language.)
 *
 * options: [{ label, icon?, destructive?, onPress }]
 * The sheet closes first, then runs onPress after the Modal has dismissed so a
 * follow-up sheet/alert opened by the action never collides with this one.
 */
export default function ActionSheet({ open, title, subtitle, options = [], onClose, bottomInset = 0 }) {
  const { translateY, panHandlers } = useSheetDrag(onClose);
  const run = (opt) => {
    Haptics.selectionAsync().catch(() => {});
    onClose && onClose();
    if (opt.onPress) setTimeout(opt.onPress, 280);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} accessibilityLabel="Close menu" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <Animated.View {...panHandlers} style={{ transform: [{ translateY }], backgroundColor: c('surfaceElevated'), borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14 + bottomInset, ...shadow(3) }}>
          <View style={{ width: 38, height: 4, borderRadius: 9999, backgroundColor: c('fgMuted'), opacity: 0.4, alignSelf: 'center', marginBottom: 10 }} />

          {title ? (
            <View style={{ alignItems: 'center', paddingBottom: 10 }}>
              <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={{ fontSize: 12, color: c('fgMuted'), marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
          ) : null}

          <View style={{ backgroundColor: c('surface'), borderWidth: 1, borderColor: c('border'), borderRadius: 14, overflow: 'hidden' }}>
            {options.map((opt, i) => {
              const tone = opt.destructive ? c('expense') : c('fg');
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => run(opt)}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  style={({ pressed }) => [
                    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: i < options.length - 1 ? 1 : 0, borderBottomColor: c('border', 0.4) },
                    pressed && { backgroundColor: c('surfaceHover') },
                  ]}
                >
                  {opt.icon ? (
                    <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: opt.destructive ? c('expense', 0.13) : c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={opt.icon} size={16} color={opt.destructive ? c('expense') : c('fgMuted')} />
                    </View>
                  ) : null}
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: ff.med, color: tone }}>{opt.label}</Text>
                  {opt.value ? <Text style={{ fontSize: 13, color: c('fgMuted') }}>{opt.value}</Text> : null}
                  {opt.selected ? <Icon name="check" size={16} color={c('primary')} stroke={2.5} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [{ marginTop: 10, height: 48, borderRadius: 12, backgroundColor: c('surfaceSecondary'), alignItems: 'center', justifyContent: 'center' }, pressed && { backgroundColor: c('surfaceHover') }]}
          >
            <Text style={{ fontSize: 15, fontFamily: ff.semi, color: c('fg') }}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
