import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../Icon';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { maxButtonWidth, radius, shadows, spacing } from '../../theme/layout';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'danger';
}

interface ToastProps {
  message: ToastMessage | null;
  onHide: () => void;
}

/**
 * Confirmation éphémère après une écriture (« Vente enregistrée »).
 *
 * Préférée à une alerte système : elle n'interrompt pas le geste suivant,
 * ce qui compte quand on enchaîne les commandes en plein service.
 */
export function Toast({ message, onHide }: ToastProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return undefined;

    progress.setValue(0);
    const sequence = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    sequence.start(({ finished }) => {
      if (finished) onHide();
    });

    return () => sequence.stop();
    // `message.id` change à chaque notification, y compris si le texte est
    // identique : c'est ce qui rejoue l'animation.
  }, [message?.id, progress, onHide, message]);

  if (!message) return null;

  const success = message.tone === 'success';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          bottom: insets.bottom + 84,
          backgroundColor: success ? colors.success : colors.danger,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          ],
        },
      ]}
    >
      <Icon
        name={success ? 'check' : 'alert'}
        size={16}
        color={colors.textOnPrimary}
        strokeWidth={2.4}
      />
      <Text style={styles.text} numberOfLines={2}>
        {message.text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.xxl,
    right: spacing.xxl,
    maxWidth: maxButtonWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    ...shadows.large,
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
});
