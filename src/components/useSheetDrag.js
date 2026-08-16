import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * Pan-to-dismiss for bottom sheets. The drag handle has always *looked*
 * draggable — this makes it true.
 *
 *   const { translateY, panHandlers } = useSheetDrag(onClose);
 *   <Animated.View style={{ transform: [{ translateY }] }}>
 *     <View {...panHandlers}>…handle/header…</View>
 *
 * Attach panHandlers to the handle/header region only when the sheet contains
 * its own ScrollView (so the two gestures don't fight); on short sheets it can
 * cover the whole container — taps still land, only vertical drags capture.
 */
export function useSheetDrag(onClose) {
  const translateY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.8) {
          Animated.timing(translateY, { toValue: 700, duration: 180, useNativeDriver: true }).start(() => {
            translateY.setValue(0); // reset for next open
            closeRef.current && closeRef.current();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    })
  ).current;

  return { translateY, panHandlers: responder.panHandlers };
}
