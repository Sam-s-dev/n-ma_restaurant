import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { radius, shadows, spacing } from '../../theme/layout';

export interface TabDefinition<T extends string> {
  key: T;
  label: string;
  icon: IconName;
  /** Pastille rouge : alertes de stock, créances en retard. */
  badge?: number;
}

interface TabBarProps<T extends string> {
  tabs: Array<TabDefinition<T>>;
  active: T;
  onChange: (key: T) => void;
}

/**
 * Barre d'onglets basse.
 *
 * Cinq entrées au maximum : au-delà, les zones tactiles descendent sous les
 * 44 points recommandés et l'on rate systématiquement sa cible en plein
 * service. Les modules moins fréquents sont regroupés sous « Plus ».
 */
export function TabBar<T extends string>({ tabs, active, onChange }: TabBarProps<T>) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {tabs.map((tab) => {
        const selected = tab.key === active;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
              <Icon
                name={tab.icon}
                size={20}
                color={selected ? colors.textOnPrimary : colors.textTertiary}
                strokeWidth={selected ? 2.2 : 1.9}
              />
              {tab.badge !== undefined && tab.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...shadows.medium,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  iconWrap: {
    width: 46,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 6,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    lineHeight: 11,
    color: colors.textOnPrimary,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  labelActive: {
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
});
