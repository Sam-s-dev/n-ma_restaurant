import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Card } from '../Card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Valeur mise en avant à droite du titre (total de la période). */
  highlight?: string;
  highlightTone?: 'neutral' | 'positive' | 'negative';
  /** Sélecteur de période ou légende, posé sous le titre. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Cadre commun à tous les graphiques : titre, valeur clé, contenu, pied. */
export function ChartCard({
  title,
  subtitle,
  highlight,
  highlightTone = 'neutral',
  toolbar,
  children,
  footer,
  style,
}: ChartCardProps) {
  const highlightColor =
    highlightTone === 'positive'
      ? colors.success
      : highlightTone === 'negative'
        ? colors.danger
        : colors.textPrimary;

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text style={[typography.h3, styles.title]}>{title}</Text>
          {Boolean(subtitle) && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {Boolean(highlight) && (
          <View style={styles.highlight}>
            <Text style={[styles.highlightText, { color: highlightColor }]} numberOfLines={1}>
              {highlight}
            </Text>
          </View>
        )}
      </View>

      {toolbar}
      <View style={styles.body}>{children}</View>
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
  },
  subtitle: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
    marginTop: 2,
  },
  highlight: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    maxWidth: '52%',
  },
  highlightText: {
    ...typography.bodyStrong,
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    marginTop: spacing.lg,
  },
});
