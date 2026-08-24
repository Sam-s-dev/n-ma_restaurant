import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

/** Échelle d'espacement en multiples de 4. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 30,
  /** Boutons et champs en pilule. */
  pill: 999,
} as const;

/**
 * Ombres douces et diffuses. iOS et Android n'utilisant pas le même
 * mécanisme, chaque niveau définit les deux.
 */
function shadow(
  opacity: number,
  radiusValue: number,
  offsetY: number,
  elevation: number,
): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#1A1118',
      shadowOpacity: opacity,
      shadowRadius: radiusValue,
      shadowOffset: { width: 0, height: offsetY },
    },
    android: { elevation },
    default: {
      boxShadow: `0px ${offsetY}px ${radiusValue}px rgba(26, 17, 24, ${opacity})`,
    },
  }) as ViewStyle;
}

export const shadows = {
  /** Cards au repos : présentes mais discrètes. */
  soft: shadow(0.06, 16, 4, 2),
  /** Cards mises en avant. */
  medium: shadow(0.09, 24, 8, 5),
  /** Hero et éléments flottants. */
  large: shadow(0.14, 32, 14, 10),
  /** Bouton principal : ombre teintée de rouge. */
  primaryButton: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#E63946',
      shadowOpacity: 0.32,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 6 },
    default: { boxShadow: '0px 8px 16px rgba(230, 57, 70, 0.32)' },
  }) as ViewStyle,
} as const;

/** Marge horizontale commune à tous les écrans. */
export const screenPadding = spacing.xxl;

/**
 * Largeur de référence d'un écran de téléphone. Sert à dimensionner les
 * visuels (photo du hero) pour qu'ils ne gonflent pas sur grand écran.
 */
export const maxContentWidth = 520;

/**
 * Plafond de largeur des boutons. Sans lui, un bouton pleine largeur
 * traverse tout l'écran dans un navigateur.
 */
export const maxButtonWidth = 420;
