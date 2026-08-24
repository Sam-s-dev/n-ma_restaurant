import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';
import { emptyBarColor } from './chartTheme';

export interface BarDatum {
  label: string;
  value: number;
  /** Deuxième ligne de l'infobulle (nombre de tickets, par exemple). */
  caption?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  formatValue: (value: number) => string;
  /** Une étiquette sur N, quand les barres sont trop serrées (24 heures). */
  labelEvery?: number;
}

/**
 * Histogramme animé.
 *
 * Contrairement à la courbe, les barres sont de vraies `Animated.View` :
 * l'animation se joue alors sans repasser par React à chaque image.
 *
 * La barre la plus haute est mise en avant dès l'affichage — c'est
 * l'information que l'on cherche ici (l'heure de pointe, le meilleur jour) ;
 * un appui permet ensuite de lire n'importe quelle autre barre.
 */
export function BarChart({
  data,
  height = 170,
  color = colors.primary,
  formatValue,
  labelEvery = 1,
}: BarChartProps) {
  const max = useMemo(() => Math.max(0, ...data.map((item) => item.value)), [data]);
  const peakIndex = useMemo(
    () => data.reduce((best, item, index) => (item.value > (data[best]?.value ?? 0) ? index : best), 0),
    [data],
  );

  const [selected, setSelected] = useState<number | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const signature = data.map((item) => item.value).join(',');
  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      // On anime une hauteur en pixels : le pilote natif ne gère que
      // l'opacité et les transformations.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [signature, progress]);

  const barsHeight = height - 22;
  const shown = selected ?? peakIndex;
  const highlighted = data[shown];
  const hasData = max > 0;

  return (
    <View>
      <View style={styles.readout}>
        {hasData && highlighted ? (
          <>
            <Text style={styles.readoutValue}>{formatValue(highlighted.value)}</Text>
            <Text style={styles.readoutLabel}>
              {highlighted.label}
              {highlighted.caption ? ` · ${highlighted.caption}` : ''}
            </Text>
          </>
        ) : (
          <Text style={styles.readoutLabel}>Aucune vente sur la période.</Text>
        )}
      </View>

      <View style={[styles.bars, { height: barsHeight }]}>
        {data.map((item, index) => {
          const ratio = max > 0 ? item.value / max : 0;
          const isActive = index === shown && hasData;

          return (
            <Pressable
              key={`${item.label}-${index}`}
              style={styles.column}
              onPress={() => setSelected(index)}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} : ${formatValue(item.value)}`}
            >
              <View style={styles.track}>
                <Animated.View
                  style={[
                    styles.bar,
                    {
                      height: progress.interpolate({
                        inputRange: [0, 1],
                        // 3 px minimum : une barre à zéro reste visible et
                        // l'axe garde son rythme.
                        outputRange: [0, Math.max(3, ratio * (barsHeight - 4))],
                      }),
                    },
                  ]}
                >
                  {ratio > 0 ? (
                    <LinearGradient
                      colors={isActive ? [color, color] : [`${color}99`, `${color}55`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: emptyBarColor }]} />
                  )}
                </Animated.View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.labels}>
        {data.map((item, index) => (
          <View key={`label-${item.label}-${index}`} style={styles.labelSlot}>
            {index % labelEvery === 0 && (
              <Text
                style={[styles.label, index === shown && hasData && styles.labelActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    marginBottom: spacing.md,
    minHeight: 40,
  },
  readoutValue: {
    ...typography.h2,
    fontSize: 19,
    lineHeight: 25,
  },
  readoutLabel: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  column: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  track: {
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  labels: {
    flexDirection: 'row',
    gap: 3,
    marginTop: spacing.sm,
  },
  labelSlot: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  labelActive: {
    color: colors.textPrimary,
  },
});
