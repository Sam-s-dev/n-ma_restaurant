import { colors } from '../../theme/colors';

/**
 * Couleurs des graphiques.
 *
 * Le rouge de la marque reste en tête : c'est toujours la série principale
 * (la recette). Les suivantes empruntent les teintes des icônes, déjà
 * accordées à la palette, pour que six parts de camembert restent
 * distinguables sans jamais concurrencer l'accent.
 */
export const chartPalette = [
  colors.primary,
  colors.iconAmber,
  colors.iconBlue,
  colors.iconGreen,
  colors.iconPurple,
  colors.iconPink,
] as const;

/** Couleur de la n-ième série, en boucle si les données débordent. */
export function paletteAt(index: number): string {
  return chartPalette[index % chartPalette.length] ?? colors.primary;
}

/** Lignes de repère : visibles sans jamais accrocher l'œil. */
export const gridColor = '#EDEDF1';

/** Barre « creuse » : un jour sans vente reste dessiné, en très clair. */
export const emptyBarColor = '#F0F0F3';

/**
 * Arrondit la borne haute d'un axe à une valeur lisible (1, 2, 2,5 ou 5
 * fois une puissance de dix). Sans cela, l'axe affiche « 13 847 » et le
 * lecteur doit faire un effort pour situer les points.
 */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
