import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Pastille de comptage à droite du libellé (nombre de plats, d'alertes…). */
  badge?: number;
}

interface ChipsProps<T extends string> {
  options: Array<ChoiceOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Marge de compensation quand la rangée traverse un écran à padding. */
  bleed?: number;
}

/**
 * Rangée de filtres défilante. Utilisée dès que les options sont nombreuses
 * ou de longueur variable (catégories du menu, catégories de dépense).
 */
export function Chips<T extends string>({ options, value, onChange, bleed = 0 }: ChipsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={bleed ? { marginHorizontal: -bleed } : undefined}
      contentContainerStyle={[styles.chipsRow, bleed ? { paddingHorizontal: bleed } : null]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {option.label}
            </Text>
            {option.badge !== undefined && option.badge > 0 && (
              <View style={[styles.badge, selected && styles.badgeSelected]}>
                <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>
                  {option.badge}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface SegmentedProps<T extends string> {
  options: Array<ChoiceOption<T>>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bascule à deux ou trois positions, dans un rail gris. Réservée aux choix
 * courts et fixes — au-delà de trois, préférer `Chips`.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedProps<T>) {
  return (
    <View style={[styles.rail, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text
              style={[styles.segmentText, selected && styles.segmentTextSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chipsRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: fontFamily.semiBold,
    color: colors.textOnPrimary,
  },
  badge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
  },
  badgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  badgeTextSelected: {
    color: colors.textOnPrimary,
  },
  rail: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.pill,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  segmentTextSelected: {
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
});
