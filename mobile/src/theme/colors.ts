/**
 * Palette N'ma Restaurant.
 *
 * Fond clair, accent rouge chaud, cards blanches. Les tons pastel servent
 * de fond aux icônes de catégories : ils sont volontairement très
 * désaturés pour que le rouge reste le seul accent fort de l'écran.
 */
export const colors = {
  // Fonds
  background: '#FAFAFA',
  backgroundAlt: '#F4F4F5',
  surface: '#FFFFFF',

  // Accent principal
  primary: '#E63946',
  primaryDark: '#D62839',
  primaryDarker: '#B21E2F',
  primarySoft: '#FDECEE',

  // Texte
  textPrimary: '#17161A',
  textSecondary: '#6B6B75',
  textTertiary: '#9A9AA3',
  textOnPrimary: '#FFFFFF',

  // Bordures et séparateurs
  border: '#ECECEF',
  borderStrong: '#DEDEE3',

  // Fonds pastel des icônes
  pastelRed: '#FDECEE',
  pastelAmber: '#FFF4E3',
  pastelGreen: '#EAF7EF',
  pastelBlue: '#EAF1FD',
  pastelPurple: '#F2EDFC',
  pastelPink: '#FDECF5',

  // Teintes des icônes, accordées aux fonds pastel
  iconRed: '#E63946',
  iconAmber: '#E08A1E',
  iconGreen: '#2E9E5B',
  iconBlue: '#3A6FD8',
  iconPurple: '#7A5AF8',
  iconPink: '#DB4A94',

  // États
  success: '#2E9E5B',
  successSoft: '#EAF7EF',
  warning: '#E08A1E',
  warningSoft: '#FFF4E3',
  danger: '#E63946',
  dangerSoft: '#FDECEE',
  info: '#3A6FD8',
  infoSoft: '#EAF1FD',

  // Voile posé sur la photo du hero pour que le texte blanc reste lisible
  scrimTop: 'rgba(12, 8, 6, 0.10)',
  scrimMid: 'rgba(12, 8, 6, 0.45)',
  scrimBottom: 'rgba(12, 8, 6, 0.88)',
} as const;

export type ColorName = keyof typeof colors;
