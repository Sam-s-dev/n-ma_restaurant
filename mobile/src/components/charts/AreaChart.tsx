import { Fragment, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, shadows, spacing } from '../../theme/layout';
import { formatCompact } from '../../utils/money';
import { gridColor, niceCeil } from './chartTheme';
import { useReveal } from './useReveal';

export interface AreaSeries {
  label: string;
  color: string;
  values: number[];
  /** Dégradé sous la courbe : réservé à la série principale. */
  filled?: boolean;
  /** Trait discontinu, pour la série de comparaison. */
  dashed?: boolean;
}

interface AreaChartProps {
  /** Étiquettes de l'axe horizontal, une par point. */
  labels: string[];
  series: AreaSeries[];
  height?: number;
  /** Mise en forme des valeurs de l'infobulle. */
  formatValue: (value: number) => string;
}

const PAD_LEFT = 42;
const PAD_RIGHT = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;
const GRID_LINES = 4;

/**
 * Courbe d'évolution avec remplissage dégradé.
 *
 * Un appui n'importe où sur la zone tracée fait apparaître le repère
 * vertical et l'infobulle du jour le plus proche : c'est la seule façon de
 * lire une valeur précise sur un écran de téléphone, où il n'y a pas de
 * survol de souris.
 */
export function AreaChart({ labels, series, height = 190, formatValue }: AreaChartProps) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const count = labels.length;
  const signature = `${count}:${series.map((s) => s.values.join(',')).join('|')}`;
  const progress = useReveal(signature);

  const max = useMemo(() => {
    const peak = Math.max(0, ...series.flatMap((serie) => serie.values));
    return niceCeil(peak || 1);
  }, [series]);

  const plotWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotHeight;

  const xAt = (index: number) =>
    count <= 1 ? PAD_LEFT + plotWidth / 2 : PAD_LEFT + (index / (count - 1)) * plotWidth;

  /** L'animation fait « pousser » la courbe depuis la ligne du bas. */
  const yAt = (value: number) => {
    const target = baseline - (value / max) * plotHeight;
    return baseline + (target - baseline) * progress;
  };

  /** Étiquettes de l'axe : première, dernière, et une au milieu si la place manque. */
  const labelStep = count <= 5 ? 1 : Math.ceil(count / 4);

  function handleTouch(locationX: number) {
    if (count === 0 || plotWidth <= 0) return;
    const ratio = (locationX - PAD_LEFT) / plotWidth;
    const index = Math.round(ratio * (count - 1));
    setActive(Math.max(0, Math.min(count - 1, index)));
  }

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  if (count === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Aucune donnée sur la période.</Text>
      </View>
    );
  }

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <View>
          <Svg width={width} height={height}>
            <Defs>
              {series.map((serie, index) => (
                <LinearGradient
                  key={`grad-${serie.label}`}
                  id={`area-${index}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={serie.color} stopOpacity="0.30" />
                  <Stop offset="1" stopColor={serie.color} stopOpacity="0.02" />
                </LinearGradient>
              ))}
            </Defs>

            {/* Lignes de repère horizontales et leurs valeurs. */}
            {Array.from({ length: GRID_LINES }, (_, index) => {
              const ratio = index / (GRID_LINES - 1);
              const y = PAD_TOP + plotHeight * ratio;
              return (
                <Line
                  key={`grid-${index}`}
                  x1={PAD_LEFT}
                  y1={y}
                  x2={width - PAD_RIGHT}
                  y2={y}
                  stroke={gridColor}
                  strokeWidth={1}
                />
              );
            })}

            {series.map((serie, index) => {
              const points = serie.values.map((value, i) => ({ x: xAt(i), y: yAt(value) }));
              const line = buildCurve(points);

              return (
                <Fragment key={serie.label}>
                  {serie.filled && (
                    <Path
                      d={`${line} L ${xAt(count - 1)} ${baseline} L ${xAt(0)} ${baseline} Z`}
                      fill={`url(#area-${index})`}
                    />
                  )}
                  <Path
                    d={line}
                    stroke={serie.color}
                    strokeWidth={serie.dashed ? 2 : 2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={serie.dashed ? '5 5' : undefined}
                    fill="none"
                  />
                </Fragment>
              );
            })}

            {/* Repère du point sélectionné. */}
            {active !== null && (
              <>
                <Line
                  x1={xAt(active)}
                  y1={PAD_TOP}
                  x2={xAt(active)}
                  y2={baseline}
                  stroke={colors.borderStrong}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {series.map((serie) => (
                  <Circle
                    key={`dot-${serie.label}`}
                    cx={xAt(active)}
                    cy={yAt(serie.values[active] ?? 0)}
                    r={5}
                    fill={colors.surface}
                    stroke={serie.color}
                    strokeWidth={2.6}
                  />
                ))}
              </>
            )}
          </Svg>

          {/* Zone tactile posée par-dessus : le SVG ne reçoit pas les gestes. */}
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(event) => handleTouch(event.nativeEvent.locationX)}
            onResponderMove={(event) => handleTouch(event.nativeEvent.locationX)}
            onResponderRelease={() => setActive(null)}
            onResponderTerminate={() => setActive(null)}
          />

          {/* Valeurs de l'axe vertical. */}
          <View style={[styles.axis, { height }]} pointerEvents="none">
            {Array.from({ length: GRID_LINES }, (_, index) => {
              const ratio = index / (GRID_LINES - 1);
              return (
                <Text
                  key={`axis-${index}`}
                  style={[styles.axisLabel, { top: PAD_TOP + plotHeight * ratio - 7 }]}
                  numberOfLines={1}
                >
                  {formatCompact(max * (1 - ratio))}
                </Text>
              );
            })}
          </View>

          {active !== null && (
            <Tooltip
              x={xAt(active)}
              chartWidth={width}
              title={labels[active] ?? ''}
              rows={series.map((serie) => ({
                label: serie.label,
                color: serie.color,
                value: formatValue(serie.values[active] ?? 0),
              }))}
            />
          )}
        </View>
      )}

      <View style={styles.xAxis}>
        {labels.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            style={[
              styles.xLabel,
              { left: xAt(index) - 22, opacity: index % labelStep === 0 ? 1 : 0 },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

interface TooltipProps {
  x: number;
  chartWidth: number;
  title: string;
  rows: Array<{ label: string; color: string; value: string }>;
}

function Tooltip({ x, chartWidth, title, rows }: TooltipProps) {
  const TOOLTIP_WIDTH = 152;
  // Recentrée puis ramenée dans le cadre : près du bord, l'infobulle
  // sortirait de la card et serait rognée.
  const left = Math.max(0, Math.min(chartWidth - TOOLTIP_WIDTH, x - TOOLTIP_WIDTH / 2));

  return (
    <View style={[styles.tooltip, { left, width: TOOLTIP_WIDTH }]} pointerEvents="none">
      <Text style={styles.tooltipTitle}>{title}</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.tooltipRow}>
          <View style={[styles.tooltipDot, { backgroundColor: row.color }]} />
          <Text style={styles.tooltipLabel} numberOfLines={1}>
            {row.label}
          </Text>
          <Text style={styles.tooltipValue} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Courbe lissée : les points de contrôle sont placés à mi-chemin en x et à
 * la hauteur de chaque extrémité. La courbe reste ainsi comprise entre les
 * deux valeurs — un lissage plus savant ferait passer la recette sous zéro
 * entre deux jours creux.
 */
function buildCurve(points: Array<{ x: number; y: number }>): string {
  const [first, ...rest] = points;
  if (!first) return '';

  let path = `M ${first.x} ${first.y}`;
  let previous = first;

  for (const point of rest) {
    const midX = (previous.x + point.x) / 2;
    path += ` C ${midX} ${previous.y} ${midX} ${point.y} ${point.x} ${point.y}`;
    previous = point;
  }

  return path;
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.small,
    color: colors.textTertiary,
  },
  axis: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PAD_LEFT - 6,
  },
  axisLabel: {
    position: 'absolute',
    right: 0,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  xAxis: {
    height: 16,
    marginTop: -PAD_BOTTOM + 6,
  },
  xLabel: {
    position: 'absolute',
    width: 44,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textTertiary,
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadows.medium,
  },
  tooltipTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipLabel: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 10,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  tooltipValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 15,
    color: colors.textPrimary,
  },
});
