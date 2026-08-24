import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

export interface RankItem {
  label: string;
  value: number;
  /** Précision affichée sous le nom (quantité vendue, unité de stock…). */
  caption?: string;
}

interface RankBarsProps {
  items: RankItem[];
  formatValue: (value: number) => string;
  color?: string;
  emptyLabel?: string;
}

/**
 * Classement en barres horizontales : le format le plus lisible pour
 * comparer des libellés longs (noms de plats), qu'un histogramme vertical
 * tronquerait.
 *
 * Les barres se remplissent en cascade, de la première à la dernière.
 */
export function RankBars({
  items,
  formatValue,
  color = colors.primary,
  emptyLabel = 'Aucune vente sur la période.',
}: RankBarsProps) {
  const max = Math.max(1, ...items.map((item) => item.value));

  if (items.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <Row
          key={`${item.label}-${index}`}
          item={item}
          rank={index + 1}
          ratio={item.value / max}
          delay={index * 70}
          color={color}
          formatValue={formatValue}
        />
      ))}
    </View>
  );
}

interface RowProps {
  item: RankItem;
  rank: number;
  ratio: number;
  delay: number;
  color: string;
  formatValue: (value: number) => string;
}

function Row({ item, rank, ratio, delay, color, formatValue }: RowProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 620,
      delay,
      easing: Easing.out(Easing.cubic),
      // Largeur en pourcentage : hors du champ du pilote natif.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [ratio, delay, progress]);

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={[styles.rank, rank === 1 && { backgroundColor: color }]}>
          <Text style={[styles.rankText, rank === 1 && styles.rankTextFirst]}>{rank}</Text>
        </View>

        <View style={styles.texts}>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
          {Boolean(item.caption) && <Text style={styles.caption}>{item.caption}</Text>}
        </View>

        <Text style={styles.value} numberOfLines={1}>
          {formatValue(item.value)}
        </Text>
      </View>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', `${Math.max(3, ratio * 100)}%`],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={[color, `${color}80`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.lg,
  },
  row: {
    gap: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  rankTextFirst: {
    color: colors.textOnPrimary,
  },
  texts: {
    flex: 1,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  value: {
    ...typography.bodyStrong,
    fontSize: 13,
    lineHeight: 18,
  },
  track: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  empty: {
    ...typography.small,
    color: colors.textTertiary,
  },
});
