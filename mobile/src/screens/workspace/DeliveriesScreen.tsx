import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chips } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import {
  deliverDelivery,
  dispatchDelivery,
  listMyDeliveries,
  ORDER_STATUS_LABELS,
  reportDeliveryIssue,
} from '../../api/workspace/orders';
import type { OnlineOrder, OrderPayment } from '../../api/workspace/orders';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { screenPadding, spacing } from '../../theme/layout';
import { itemsSummary, OrderDetail } from './OrdersScreen';
import { useWorkspace } from './WorkspaceContext';

const POLL_MS = 15_000;

/**
 * Les courses du livreur, et rien d'autre : il voit l'adresse, le repère,
 * le téléphone du client et ce qu'il doit encaisser, puis ce qu'il doit
 * reverser à la caisse en rentrant.
 */
export function DeliveriesScreen() {
  const { money, notify, notifications } = useWorkspace();
  const [orders, setOrders] = useState<OnlineOrder[] | null>(null);
  const [toHandOver, setToHandOver] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<OnlineOrder | null>(null);
  const [sheet, setSheet] = useState<'none' | 'deliver' | 'issue'>('none');
  const [method, setMethod] = useState<OrderPayment>('cash');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listMyDeliveries();
      setOrders(result.data);
      setToHandOver(result.toHandOver);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des courses impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Une course confiée ou annulée : la liste suit sans attendre.
  const latestId = notifications[0]?.id;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load();
  }, [latestId, load]);

  async function run(action: () => Promise<OnlineOrder>, message: string) {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await action();
      setSheet('none');
      setDetail(updated.status === 'out_for_delivery' ? updated : null);
      notify(message);
      void load();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !orders) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!orders) return <LoadingState label="Chargement de vos courses…" />;

  const active = orders.filter((order) => ['accepted', 'ready', 'out_for_delivery'].includes(order.status));
  const done = orders.filter((order) => order.status === 'delivered' || order.status === 'completed');

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
        <Card reveal={0} style={styles.summary}>
          <Text style={styles.summaryLabel}>À reverser à la caisse</Text>
          <Text style={[styles.summaryValue, toHandOver > 0 && { color: colors.warning }]}>{money(toHandOver)}</Text>
          <Text style={styles.summaryHint}>
            {toHandOver > 0
              ? 'Remettez cet argent au caissier : il confirmera l’avoir reçu.'
              : 'Rien à reverser pour le moment.'}
          </Text>
        </Card>

        {active.length === 0 ? (
          <EmptyState
            icon="truck"
            title="Aucune course en cours"
            message="Quand le restaurant vous confie une commande, elle apparaît ici avec une notification sonore."
          />
        ) : (
          <Card reveal={1} style={styles.block}>
            {active.map((order, index) => (
              <View key={order.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon="truck"
                  iconColor={order.status === 'out_for_delivery' ? colors.iconBlue : colors.iconAmber}
                  iconBackground={order.status === 'out_for_delivery' ? colors.pastelBlue : colors.pastelAmber}
                  title={`${order.customerName} · ${order.zoneName ?? ''}`}
                  subtitle={`${order.landmark ?? ''}\n${itemsSummary(order)}`}
                  subtitleLines={2}
                  value={money(order.totalAmount)}
                  valueCaption={order.status === 'accepted' ? 'En cuisine' : ORDER_STATUS_LABELS[order.status]}
                  onPress={() => {
                    setActionError(null);
                    setDetail(order);
                  }}
                />
              </View>
            ))}
          </Card>
        )}

        {done.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Livrées aujourd’hui</Text>
            <Card reveal={2}>
              {done.map((order, index) => (
                <View key={order.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    icon="check"
                    iconColor={colors.iconGreen}
                    iconBackground={colors.pastelGreen}
                    title={`${order.customerName} · ${order.zoneName ?? ''}`}
                    subtitle={order.reference}
                    value={money(order.totalAmount)}
                    valueCaption={order.status === 'completed' ? 'Reversé' : 'À reverser'}
                    valueTone={order.status === 'completed' ? 'muted' : 'neutral'}
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      <Sheet
        visible={Boolean(detail) && sheet === 'none'}
        title={detail ? `${detail.reference} · ${ORDER_STATUS_LABELS[detail.status]}` : ''}
        error={actionError}
        onClose={() => setDetail(null)}
        actions={
          detail ? (
            <>
              {(detail.status === 'accepted' || detail.status === 'ready') && (
                <Button
                  label="Je pars avec la commande"
                  onPress={() => void run(() => dispatchDelivery(detail.id), 'Bonne route !')}
                  loading={busy}
                />
              )}
              {detail.status === 'out_for_delivery' && (
                <>
                  <Button
                    label="Livrée"
                    onPress={() => {
                      setMethod(detail.paymentMethod);
                      setActionError(null);
                      setSheet('deliver');
                    }}
                  />
                  <Button
                    label="Problème (client injoignable…)"
                    onPress={() => {
                      setActionError(null);
                      setSheet('issue');
                    }}
                    variant="ghost"
                  />
                </>
              )}
            </>
          ) : undefined
        }
      >
        {detail && <OrderDetail order={detail} forDriver />}
      </Sheet>

      <Sheet
        visible={sheet === 'deliver'}
        title="Commande livrée"
        subtitle={detail ? `${detail.customerName} · ${money(detail.totalAmount)}` : undefined}
        error={actionError}
        onClose={() => setSheet('none')}
        actions={
          <Button
            label={`J’ai reçu ${detail ? money(detail.totalAmount) : ''}`}
            onPress={() => detail && void run(() => deliverDelivery(detail.id, method), 'Livraison enregistrée')}
            loading={busy}
          />
        }
      >
        <Text style={styles.note}>Comment le client a-t-il payé ?</Text>
        <Chips
          options={[
            { value: 'cash', label: 'Espèces' },
            { value: 'mobile_money', label: 'Mobile Money' },
          ]}
          value={method}
          onChange={setMethod}
        />
      </Sheet>

      <ConfirmSheet
        visible={sheet === 'issue'}
        title="Signaler un problème"
        message="La commande revient au restaurant, qui décidera : nouvel essai ou annulation."
        confirmLabel="Signaler"
        reasonLabel="Que se passe-t-il ?"
        loading={busy}
        error={actionError}
        onCancel={() => setSheet('none')}
        onConfirm={(issue) => detail && void run(() => reportDeliveryIssue(detail.id, issue), 'Problème signalé au restaurant')}
      />
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
  summary: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  summaryValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  summaryHint: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  block: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.bodyStrong,
    marginBottom: spacing.sm,
  },
  note: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
