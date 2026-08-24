import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';

interface CardProps {
  children: React.ReactNode;
  /** `flat` retire l'ombre : utile pour les cards posées sur un fond coloré. */
  elevation?: 'soft' | 'medium' | 'flat';
  style?: StyleProp<ViewStyle>;
}

/** Card blanche à coins très arrondis et ombre diffuse. */
export function Card({ children, elevation = 'soft', style }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevation === 'soft' && shadows.soft,
        elevation === 'medium' && shadows.medium,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    // Sur Android l'élévation seule ne dessine pas de contour : une bordure
    // très claire évite que la card se fonde dans le gris du fond.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
