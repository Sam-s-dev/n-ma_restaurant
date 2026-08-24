import { StyleSheet } from 'react-native';
import { colors } from './colors';

/**
 * Poppins : géométrique, moderne, lettres rondes — le registre attendu
 * pour une application de restauration. Les noms de familles correspondent
 * aux clés chargées par `useAppFonts` (src/theme/fonts.ts).
 */
export const fontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

/**
 * Poppins a un œil relativement grand : on resserre légèrement l'interlettrage
 * des gros titres pour éviter l'effet « lettres qui flottent ».
 */
export const typography = StyleSheet.create({
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  h2: {
    fontFamily: fontFamily.semiBold,
    fontSize: 21,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  h3: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
  },
  bodyStrong: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textPrimary,
  },
  small: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  button: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
});
