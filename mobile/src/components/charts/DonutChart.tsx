import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';
import { percentOf } from '../../utils/money';
import { useReveal } from './useReveal';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  /**
   * Diamètre. La valeur par défaut est délibérément modeste : sur un écran
   * de 390 points, un camembert plus large ne laisse pas assez de place à
   * la légende, et « Achat de stock » s'y retrouve tronqué.
   */
  size?: number;
  thickness?: number;
  /** Libellé affiché au centre quand aucune part n'est sélectionnée. */
  centerCaption: string;
  formatValue: (value: number) => string;
  emptyLabel?: string;
}

/**
 * Camembert évidé et sa légende.
 *
 * Le centre affiche le total ; toucher une ligne de la légende y bascule le
 * détail de la part. C'est plus lisible qu'un pourcentage collé sur une
 * part fine, et cela évite les étiquettes qui se chevauchent.
 */
export function DonutChart({
  slices,
  size = 132,
  thickness = 18,
  centerCaption,
  formatValue,
  emptyLabel = 'Rien à afficher pour l’instant.',
}: DonutChartProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const total = useMemo(() => slices.reduce((sum, slice) => sum + slice.value, 0), [slices]);
  const signature = slices.map((slice) => `${slice.label}:${slice.value}`).join('|');
  const progress = useReveal(signature, 800);

  if (total <= 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const radiusValue = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radiusValue;

  // Les parts sont empilées : chacune démarre là où la précédente s'arrête.
  let offset = 0;
  const arcs = slices.map((slice, index) => {
    const length = (slice.value / total) * circumference * progress;
    const arc = { slice, index, length, offset };
    offset += length;
    return arc;
  });

  const active = selected !== null ? slices[selected] : null;

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Rotation d'un quart de tour : la première part démarre en haut. */}
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radiusValue}
              stroke={colors.backgroundAlt}
              strokeWidth={thickness}
              fill="none"
            />
            {arcs.map(({ slice, index, length, offset: start }) => (
              <Circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radiusValue}
                stroke={slice.color}
                strokeWidth={selected === index ? thickness + 5 : thickness}
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={-start}
                strokeLinecap="butt"
                opacity={selected === null || selected === index ? 1 : 0.35}
                fill="none"
              />
            ))}
          </G>
        </Svg>

        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(active ? active.value : total)}
          </Text>
          <Text style={styles.centerCaption} numberOfLines={1}>
            {active ? active.label : centerCaption}
          </Text>
        </View>
      </View>

      <View style={styles.legend}>
        {slices.map((slice, index) => (
          <Pressable
            key={slice.label}
            style={[styles.legendRow, selected === index && styles.legendRowActive]}
            onPress={() => setSelected(selected === index ? null : index)}
            accessibilityRole="button"
            accessibilityLabel={`${slice.label} : ${formatValue(slice.value)}`}
          >
            <View style={[styles.dot, { backgroundColor: slice.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text style={styles.legendPercent}>
              {Math.round(percentOf(slice.value, total))} %
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  centerValue: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'center',
  },
  centerCaption: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 1,
  },
  legend: {
    flex: 1,
    gap: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  legendRowActive: {
    backgroundColor: colors.backgroundAlt,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendLabel: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  legendPercent: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textPrimary,
  },
  empty: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
