import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chips } from '../../components/workspace/Chips';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import { getReceipt } from '../../api/workspace/sales';
import { billName, listBills, payBill } from '../../api/workspace/tables';
import type { Bill } from '../../api/workspace/tables';
import { formatTime } from '../../utils/date';
import { escapeHtml, printDocument, printReceipt } from '../../utils/receiptPdf';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const POLL_MS = 10_000;

type Method = 'cash' | 'mobile_money' | 'card';

/** Plats d'une addition, regroupés : deux envois du même plat font une ligne. */
function linesOf(bill: Bill) {
  const lines = new Map<string, { name: string; quantity: number; total: number }>();
  for (const item of bill.items) {
    if (item.status === 'cancelled') continue;
    const key = `${item.dishName}|${item.unitPrice}`;
    const line = lines.get(key) ?? { name: item.dishName, quantity: 0, total: 0 };
    line.quantity += item.quantity;
    line.total += item.lineTotal;
    lines.set(key, line);
  }
  return [...lines.values()];
}

/**
 * Additions des tables, côté caissier. Celles que le serveur a demandées
 * passent en tête, avec une notification sonore. Encaisser crée la vente
 * dans la caisse ouverte, prévient le serveur et libère la table.
 */
export function BillsScreen() {
  const { money, notify, notifications, refreshBalance, profile } = useWorkspace();
  const [view, setView] = useState<'active' | 'paid'>('active');
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<Bill | null>(null);
  const [method, setMethod] = useState<Method>('cash');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Bill | null>(null);

  const load = useCallback(async () => {
    try {
      setBills(await listBills(view));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des additions impossible.');
    }
  }, [view]);

  useEffect(() => {
    setBills(null);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const latestId = notifications[0]?.id;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load();
  }, [latestId, load]);

  function printNote(bill: Bill) {
    const rows = linesOf(bill)
      .map(
        (line) =>
          `<tr><td>${line.quantity} × ${escapeHtml(line.name)}</td><td style="text-align:right">${escapeHtml(money(line.total))}</td></tr>`,
      )
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; padding: 8px; }
      h1 { font-size: 15px; text-align: center; margin: 0 0 4px; }
      p { text-align: center; margin: 0 0 8px; color: #555; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 3px 0; }
      .total td { border-top: 1px dashed #000; font-weight: bold; font-size: 14px; padding-top: 6px; }
    </style></head><body>
      <h1>${escapeHtml(profile.restaurant.name)}</h1>
      <p>Note · ${escapeHtml(billName(bill))}<br/>${bill.guests} couvert(s) · ${escapeHtml(bill.waiter?.fullName ?? '')}</p>
      <table>${rows}<tr class="total"><td>Total à payer</td><td style="text-align:right">${escapeHtml(money(bill.total))}</td></tr></table>
      <p style="margin-top:10px">Ceci n’est pas un reçu.</p>
    </body></html>`;
    void printDocument(html, { title: `Note ${billName(bill)}`, ticket: true });
  }

  async function settle() {
    if (!detail) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await payBill(detail.id, { paymentMethod: method });
      setDetail(null);
      setPaid(result);
      notify(`Encaissé : ${billName(result)}`);
      refreshBalance();
      void load();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Encaissement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function printPaidReceipt(bill: Bill) {
    if (!bill.saleId) return;
    try {
      await printReceipt(await getReceipt(bill.saleId));
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Impression impossible.', 'danger');
    }
  }

  if (error && !bills) return <ErrorState message={error} onRetry={() => void load()} />;

  const requested = (bills ?? []).filter((bill) => bill.status === 'bill_requested');

  return (
    <View style={styles.flex}>
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
          <Chips
            bleed={screenPadding}
            options={[
              { value: 'active', label: 'À encaisser', badge: view === 'active' ? requested.length : undefined },
              { value: 'paid', label: 'Payées (24 h)' },
            ]}
            value={view}
            onChange={setView}
          />
        </View>

        {!bills ? (
          <LoadingState label="Chargement des additions…" />
        ) : bills.length === 0 ? (
          <EmptyState
            icon="receipt"
            title={view === 'active' ? 'Aucune addition en cours' : 'Aucune addition payée'}
            message={
              view === 'active'
                ? 'Quand un serveur demande l’addition d’une table, elle arrive ici avec une notification sonore.'
                : 'Les additions encaissées des dernières 24 heures.'
            }
          />
        ) : (
          <Card reveal={0}>
            {bills.map((bill, index) => (
              <View key={bill.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon="receipt"
                  iconColor={bill.status === 'bill_requested' ? colors.iconRed : bill.status === 'paid' ? colors.iconGreen : colors.iconBlue}
                  iconBackground={bill.status === 'bill_requested' ? colors.pastelRed : bill.status === 'paid' ? colors.pastelGreen : colors.pastelBlue}
                  title={billName(bill)}
                  subtitle={`${bill.waiter?.fullName ?? '—'} · ${
                    bill.status === 'bill_requested' && bill.billRequestedAt
                      ? `demandée à ${formatTime(bill.billRequestedAt)}`
                      : bill.paidAt
                        ? `payée à ${formatTime(bill.paidAt)}`
                        : `en cours depuis ${formatTime(bill.openedAt)}`
                  }`}
                  value={money(bill.total)}
                  valueCaption={bill.status === 'bill_requested' ? 'À encaisser' : bill.status === 'paid' ? bill.saleReference ?? 'Payée' : 'En cours'}
                  onPress={() => {
                    setActionError(null);
                    setMethod('cash');
                    if (bill.status === 'paid') setPaid(bill);
                    else setDetail(bill);
                  }}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <Sheet
        visible={Boolean(detail)}
        title={detail ? billName(detail) : ''}
        subtitle={detail ? `${detail.guests} couvert(s) · ${detail.waiter?.fullName ?? ''}` : undefined}
        error={actionError}
        onClose={() => setDetail(null)}
        actions={
          detail ? (
            <>
              <Button label={`Encaisser ${money(detail.total)}`} onPress={() => void settle()} loading={busy} />
              <Button label="Imprimer la note pour le client" onPress={() => printNote(detail)} variant="secondary" />
            </>
          ) : undefined
        }
      >
        {detail && (
          <>
            {detail.status === 'open' && (
              <View style={styles.block}>
                <Banner tone="info" message="Le serveur n’a pas encore demandé l’addition : vérifiez que le client a fini." />
              </View>
            )}
            {linesOf(detail).map((line) => (
              <View key={line.name} style={styles.line}>
                <Text style={styles.lineName}>
                  {line.quantity} × {line.name}
                </Text>
                <Text style={styles.lineValue}>{money(line.total)}</Text>
              </View>
            ))}
            <View style={[styles.line, styles.totalLine]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{money(detail.total)}</Text>
            </View>
            <Text style={styles.blockLabel}>Mode de paiement</Text>
            <Chips
              options={[
                { value: 'cash', label: 'Espèces' },
                { value: 'mobile_money', label: 'Mobile Money' },
                { value: 'card', label: 'Carte' },
              ]}
              value={method}
              onChange={setMethod}
            />
          </>
        )}
      </Sheet>

      <Sheet
        visible={Boolean(paid)}
        title="Addition payée"
        subtitle={paid ? `${billName(paid)} · ${money(paid.total)}` : undefined}
        onClose={() => setPaid(null)}
        actions={
          paid ? (
            <>
              <Button label="Imprimer le reçu" onPress={() => void printPaidReceipt(paid)} />
              <Button label="Fermer" onPress={() => setPaid(null)} variant="ghost" />
            </>
          ) : undefined
        }
      >
        <Text style={styles.note}>
          La vente {paid?.saleReference ?? ''} est enregistrée dans la caisse. Le serveur est prévenu ; la table se libère
          quand toutes ses additions sont payées.
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  block: {
    marginBottom: spacing.md,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: 4,
  },
  lineName: {
    ...typography.body,
    flex: 1,
  },
  lineValue: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  totalLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  totalLabel: {
    ...typography.bodyStrong,
  },
  totalValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
  },
  blockLabel: {
    ...typography.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  note: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
