import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Icon } from '../Icon';
import { Reveal } from './Motion';
import { mediaUrl, THUMB } from '../../api/client';
import type { Dish } from '../../api/workspace/menu';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, shadows, spacing } from '../../theme/layout';

const GRID_GAP = 12;

interface DishGridProps {
  dishes: Dish[];
  /** Quantité déjà choisie par plat, affichée en pastille. */
  counts: Record<string, number>;
  onAdd: (dish: Dish) => void;
  money: (value: number) => string;
}

/**
 * La carte en vignettes : photo, prix, portions restantes. Partagée par
 * l'écran de vente du comptoir et la prise de commande du serveur, pour
 * qu'ils voient exactement la même chose.
 */
export function DishGrid({ dishes, counts, onAdd, money }: DishGridProps) {
  const [cardWidth, setCardWidth] = useState(0);

  /**
   * Deux colonnes sur un téléphone, davantage sur un écran large : on vise
   * une carte d'environ 165 points, largeur en dessous de laquelle le nom
   * d'un plat ne tient plus sur deux lignes.
   */
  const measureGrid = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    const columns = Math.max(2, Math.floor(width / 175));
    setCardWidth(Math.floor((width - GRID_GAP * (columns - 1)) / columns));
  }, []);

  return (
    /*
      Largeur de colonne calculée plutôt que laissée au `flex` : avec
      `flexGrow`, la dernière carte d'une rangée incomplète s'étirait sur
      toute la largeur restante et n'avait plus la taille de ses voisines.
    */
    <View style={styles.dishGrid} onLayout={measureGrid}>
      {dishes.map((dish, position) => {
        const inCart = counts[dish.id] ?? 0;

        return (
          <Reveal key={dish.id} index={position} style={[styles.dishSlot, cardWidth ? { width: cardWidth } : null]}>
            <Pressable
              onPress={() => dish.isAvailable && onAdd(dish)}
              disabled={!dish.isAvailable}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${dish.name}`}
              style={({ pressed }) => [
                styles.dishCard,
                !dish.isAvailable && styles.dishCardOff,
                pressed && dish.isAvailable && styles.dishCardPressed,
              ]}
            >
              {/*
                Cadre au rapport fixe : quelle que soit la photo envoyée
                — portrait, panoramique, carrée — elle est recadrée dans la
                même vignette, et toutes les cartes s'alignent.
              */}
              <View style={styles.dishImageFrame}>
                {dish.photoMediaId ? (
                  <Image
                    source={{ uri: mediaUrl(dish.photoMediaId, THUMB.medium) as string }}
                    style={styles.dishImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Icon name="menu-book" size={22} color={colors.textTertiary} strokeWidth={1.7} />
                )}

                {inCart > 0 && (
                  <View style={styles.dishCount}>
                    <Text style={styles.dishCountText}>{inCart}</Text>
                  </View>
                )}
              </View>

              {/* Hauteurs réservées : deux lignes de nom, une de catégorie,
                  une de pied — même si le texte est plus court, la carte
                  garde la même hauteur. */}
              <Text style={styles.dishName} numberOfLines={2}>
                {dish.name}
              </Text>
              <Text style={styles.dishCategory} numberOfLines={1}>
                {dish.categoryName ?? 'Sans catégorie'}
              </Text>
              <Text style={styles.dishPrice} numberOfLines={1}>
                {money(dish.price)}
              </Text>
              <Text
                style={[
                  styles.dishFooter,
                  !dish.isAvailable && styles.dishFooterOff,
                  dish.isAvailable &&
                    dish.availableQuantity !== null &&
                    dish.availableQuantity <= 3 &&
                    styles.dishFooterLow,
                ]}
                numberOfLines={1}
              >
                {!dish.isAvailable
                  ? 'En rupture'
                  : dish.availableQuantity !== null
                    ? `${dish.availableQuantity} portion(s)`
                    : 'Toujours disponible'}
              </Text>
            </Pressable>
          </Reveal>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  dishSlot: {
    // La largeur est fixée à la mesure ; sans elle, rien ne s'affiche
    // avant le premier calcul.
    minWidth: 140,
  },
  dishCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.soft,
  },
  dishCardOff: {
    opacity: 0.55,
  },
  dishCardPressed: {
    transform: [{ scale: 0.975 }],
    borderColor: colors.primary,
  },
  dishImageFrame: {
    width: '100%',
    // Rapport 4:3 : le cadre suit la largeur de la carte, et la photo est
    // recadrée dedans quelles que soient ses proportions d'origine.
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dishImage: {
    width: '100%',
    height: '100%',
  },
  dishFooter: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    height: 16,
    color: colors.textTertiary,
    marginTop: 2,
  },
  dishFooterLow: {
    color: colors.warning,
  },
  dishFooterOff: {
    color: colors.danger,
  },
  dishCount: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishCountText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textOnPrimary,
  },
  /* Hauteurs figées : deux lignes de nom réservées même pour un nom court,
     sans quoi les cartes d'une même rangée ne s'alignent pas. */
  dishName: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
    height: 38,
  },
  dishCategory: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    height: 15,
    color: colors.textTertiary,
    marginTop: 1,
  },
  dishPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 21,
    height: 21,
    color: colors.primary,
    marginTop: spacing.sm,
  },
});
