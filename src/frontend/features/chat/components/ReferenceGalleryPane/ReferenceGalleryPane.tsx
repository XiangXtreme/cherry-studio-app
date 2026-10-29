import LibraryBigIcon from '@cherrystudio/app-icons/icons/library-big';
import { duration, easing } from '@cherrystudio/ui/motion';
import { cn } from '@cherrystudio/ui/utils';
import { BlurView } from 'expo-blur';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mainHeaderRowHeight } from '@/frontend/appShell/header';
import { resolveHeaderContentInset, useFocusedBackPress } from '@/frontend/appShell/navigation';

import { useIsFullScreenLayerPresented } from '../FullScreenLayer';
import { ReferenceGalleryBrowser } from './ReferenceGalleryBrowser';
import { resolveReferencePaneWidth } from './utils/paneGeometry';

const PANE_MOTION = { duration: duration.base, easing: easing.settle };

/**
 * The conversation's floating reference gallery: a slim rail on the trailing
 * edge opens a pane over the transcript. The composer below stays visible and
 * usable, so picking a reference and sending are one flow.
 *
 * Motion is the pane's own: the rail opens it, the scrim, the close action,
 * Android back, and a horizontal drag close it. Every path sets the same
 * shared progress, so an interruption continues from the current frame;
 * Reduce Motion jumps to the end state and drops the drag.
 */
export function ReferenceGalleryPane({
  composerHeight,
  enabled,
}: {
  composerHeight: number;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reportedHeaderHeight = useHeaderHeight();
  const [headerHeight, setHeaderHeight] = useState(reportedHeaderHeight);
  if (reportedHeaderHeight > 0 && reportedHeaderHeight !== headerHeight)
    setHeaderHeight(reportedHeaderHeight);
  const contentTopInset = resolveHeaderContentInset(headerHeight, insets.top + mainHeaderRowHeight);
  const isLayerPresented = useIsFullScreenLayerPresented();
  const isReducedMotion = useReducedMotion();

  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [regionWidth, setRegionWidth] = useState(0);
  const progress = useSharedValue(0);
  const paneWidth = resolveReferencePaneWidth(regionWidth);

  const close = useCallback(() => setIsOpen(false), []);
  useFocusedBackPress(close, isOpen);

  useEffect(() => {
    if (!isMounted) return;
    if (isReducedMotion) {
      progress.set(isOpen ? 1 : 0);
      return;
    }
    progress.set(withTiming(isOpen ? 1 : 0, PANE_MOTION));
    return () => cancelAnimation(progress);
  }, [isMounted, isOpen, isReducedMotion, progress]);

  const open = useCallback(() => {
    Keyboard.dismiss();
    setIsMounted(true);
    setIsOpen(true);
  }, []);

  const pan = Gesture.Pan()
    .enabled(!isReducedMotion)
    .activeOffsetX([8, 10000])
    .failOffsetY([-24, 24])
    .onUpdate((event) => {
      'worklet';
      if (paneWidth <= 0) return;
      const next = 1 - event.translationX / paneWidth;
      progress.set(next < 0 ? 0 : next > 1 ? 1 : next);
    })
    .onEnd((event) => {
      'worklet';
      const dismiss = event.translationX > paneWidth * 0.25 || event.velocityX > 600;
      progress.set(withTiming(dismiss ? 0 : 1, PANE_MOTION));
      if (dismiss) runOnJS(close)();
    });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: paneWidth * (1 - progress.get()) }],
  }));

  if (!enabled) return null;

  return (
    <View
      className="absolute inset-x-0 z-10"
      onLayout={(event) => setRegionWidth(event.nativeEvent.layout.width)}
      pointerEvents="box-none"
      style={{ bottom: composerHeight, top: contentTopInset }}
    >
      {isMounted ? (
        <Animated.View
          accessibilityElementsHidden={!isOpen}
          className="absolute inset-0"
          importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
          pointerEvents={isOpen ? 'auto' : 'none'}
          style={scrimStyle}
        >
          <Pressable
            accessibilityLabel={t('chat.referenceGallery.close')}
            accessibilityRole="button"
            className="flex-1 bg-background/40"
            onPress={close}
          />
        </Animated.View>
      ) : null}

      {!isOpen && !isLayerPresented ? (
        <Pressable
          accessibilityLabel={t('chat.referenceGallery.open')}
          accessibilityRole="button"
          className="absolute right-0 h-16 w-8 items-center justify-center rounded-l-2xl border border-r-0 border-border-subtle bg-card/85 shadow-lg shadow-constant-black/10 active:opacity-70"
          hitSlop={8}
          onPress={open}
          style={{ marginTop: -32, top: '50%' }}
          testID="chat-reference-gallery-rail"
        >
          <LibraryBigIcon className="size-5 text-foreground" />
        </Pressable>
      ) : null}

      {isMounted ? (
        <Animated.View
          accessibilityViewIsModal={isOpen}
          className={cn(
            'absolute inset-y-0 right-0 overflow-hidden rounded-l-4xl border-l border-border-subtle shadow-2xl shadow-constant-black/25',
            Platform.OS === 'ios' ? 'bg-popover/45' : 'bg-popover/97',
          )}
          importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
          pointerEvents={isOpen ? 'auto' : 'none'}
          style={[panelStyle, { width: paneWidth }]}
          testID="reference-gallery-pane"
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} style={StyleSheet.absoluteFill} tint="systemMaterial" />
          ) : null}
          <ReferenceGalleryBrowser onClose={close} />
          {/* The only drag surface: the grid keeps its vertical scroll. */}
          <GestureDetector gesture={pan}>
            <View
              accessible={false}
              className="absolute inset-y-0 left-0 z-10 w-3 items-center justify-center"
              hitSlop={{ left: 8, right: 8, top: 32, bottom: 32 }}
              testID="reference-gallery-grip"
            >
              <View className="h-10 w-1 rounded-full bg-border" />
            </View>
          </GestureDetector>
        </Animated.View>
      ) : null}
    </View>
  );
}
