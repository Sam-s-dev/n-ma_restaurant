import { useCallback, useEffect, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chips } from '../../components/workspace/Chips';
import { Field } from '../../components/workspace/Field';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { ApiError } from '../../api/client';
import { downloadWorkbook, fetchPeriodReport } from '../../api/workspace/reports';
import type { PeriodReport } from '../../api/workspace/reports';
import { shiftDays, todayISO } from '../../utils/date';
import { printPeriodReport } from '../../utils/periodReportPdf';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

type Preset = 'month' | 'last_month' | 'week' | 'today' | 'custom';

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'month', label: 'Ce mois' },
  { value: 'last_month', label: 'Mois dernier' },
  { value: 'week', label: '7 derniers jours' },
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'custom', label: 'Autre période' },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function periodOf(preset: Preset, custom: { from: string; to: string }): { from: string; to: string } {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: shiftDays(today, -6), to: today };
    case 'last_month': {
      const lastDay = shiftDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
    case 'custom':
      return custom;
    default:
      return { from: monthStart, to: today };
  }
}

/**
 * Rapports et exports : la synthèse d'une période, à imprimer en PDF, et
 * le classeur Excel complet à transmettre au comptable.
 */
export function ReportsScreen() {
  const { money, notify } = useWorkspace();
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState({ from: `${todayISO().slice(0, 7)}-01`, to: todayISO() });
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const period = periodOf(preset, custom);
  const periodValid = ISO.test(period.from) && ISO.test(period.to) && period.from <= period.to;

  const load = useCallback(async () => {
    if (!periodValid) return;
    setError(null);
    try {
      setReport(await fetchPeriodReport(period.from, period.to));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement du rapport impossible.');
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to, periodValid]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportExcel() {
    if (Platform.OS !== 'web') {
      notify('L’export Excel se télécharge depuis la version web de N’ma.', 'danger');
      return;
    }
    setExporting(true);
    try {
      const blob = await downloadWorkbook(period.from, period.to);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nma-export-${period.from}-au-${period.to}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      notify('Classeur Excel téléchargé');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Export impossible.', 'danger');
    } finally {
      setExporting(false);
    }
  }

  async function printReport() {
    if (!report) return;
    setPrinting(true);
    try {
      await printPeriodReport(report);
    } catch {
      notify('Impression indisponible sur cet appareil.', 'danger');
    } finally {
      setPrinting(false);
    }
  }

  if (loading && !report) return <LoadingState label="Préparation du rapport…" />;
  if (error && !report) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.filters}>
        <Chips bleed={screenPadding} options={PRESETS} value={preset} onChange={setPreset} />
      </View>

      {preset === 'custom' && (
        <View style={styles.customRow}>
          <View style={styles.flex}>
            <Field
              label="Du"
              value={custom.from}
              onChangeText={(from) => setCustom((current) => ({ ...current, from }))}
              placeholder="2026-01-01"
            />
          </View>
          <View style={styles.flex}>
            <Field
              label="Au"
              value={custom.to}
              onChangeText={(to) => setCustom((current) => ({ ...current, to }))}
              placeholder={todayISO()}
              error={!periodValid ? 'Période invalide.' : undefined}
            />
          </View>
        </View>
      )}

      {report && (
        <>
          <View style={styles.kpis}>
            <Kpi label="Chiffre d’affaires" value={money(report.sales.revenue)} />
            <Kpi label="Dépenses" value={money(report.expenses.total)} />
            <Kpi
              label="Résultat"
              value={money(report.result)}
              tone={report.result >= 0 ? colors.success : colors.danger}
            />
            <Kpi label="Créances en cours" value={money(report.outstandingCredits)} />
          </View>

          <Card style={styles.card}>
            <Row label="Ventes" value={String(report.sales.count)} />
            <Row label="Encaissé" value={money(report.sales.cashed)} />
            <Row label="À crédit" value={money(report.sales.onCredit)} />
            <Row label="Remboursements reçus" value={money(report.creditRepayments)} />
            <Row label="Clôtures de caisse" value={String(report.sessions.count)} />
            <Row
              label="Écart de caisse cumulé"
              value={money(report.sessions.totalCashDifference)}
              tone={report.sessions.totalCashDifference === 0 ? undefined : colors.danger}
            />
          </Card>
        </>
      )}

      <View style={styles.actions}>
        <Button
          label="Télécharger le classeur Excel"
          onPress={() => void exportExcel()}
          loading={exporting}
          disabled={!periodValid}
        />
        <Button
          label="Imprimer le rapport (PDF)"
          onPress={() => void printReport()}
          loading={printing}
          disabled={!report}
          variant="secondary"
        />
        <Text style={styles.hint}>
          Le classeur contient un onglet par sujet — ventes, dépenses, caisse, créances,
          salaires, clôtures — à transmettre tel quel à votre comptable.
        </Text>
      </View>
    </ScrollView>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  flex: {
    flex: 1,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  kpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  kpiLabel: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
  },
  kpiValue: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textPrimary,
    marginTop: 2,
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  rowValue: {
    ...typography.bodyStrong,
    fontSize: 13,
  },
  actions: {
    gap: spacing.sm,
  },
  hint: {
    ...typography.small,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
});
