import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Reveal } from './workspace/Motion';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';

interface CardProps {
  children: React.ReactNode;
  /** `flat` retire l'ombre : utile pour les cards posées sur un fond coloré. */
  elevation?: 'soft' | 'medium' | 'flat';
  /**
   * Rang d'entrée dans l'écran. Renseigné, la card arrive en cascade avec
   * les autres ; omis, elle s'affiche immédiatement — c'est ce qu'on veut
   * sur les pages publiques, qui n'ont pas ce vocabulaire de mouvement.
   */
  reveal?: number;
  style?: StyleProp<ViewStyle>;
}

/** Card blanche à coins très arrondis et ombre diffuse. */
export function Card({ children, elevation = 'soft', reveal, style }: CardProps) {
  const card = (
    <View
      style={[
        styles.card,
        elevation === 'soft' && shadows.soft,
        elevation === 'medium' && shadows.medium,
        reveal === undefined ? style : null,
      ]}
    >
      {children}
    </View>
  );

  if (reveal === undefined) return card;

  // La marge extérieure passe sur le conteneur animé : appliquée à la card
  // elle-même, elle serait mangée par la transformation.
  return (
    <Reveal index={reveal} style={style}>
      {card}
    </Reveal>
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
