import * as Haptics from 'expo-haptics';

// Semantic haptics — call sites say what happened, not which engine constant.
// Every call is fire-and-forget and swallows errors (haptics are best-effort and
// unavailable on some devices / in the simulator).
export const haptics = {
  tap: () => Haptics.selectionAsync().catch(() => {}),      // selection change (chips, toggles)
  select: () => Haptics.selectionAsync().catch(() => {}),
  impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
