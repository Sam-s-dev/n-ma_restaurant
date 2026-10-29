import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import {
  acceptOrder,
  assignDriver,
  cancelOrder,
  completeOrder,
  fetchOnlineSettings,
  listDrivers,
  listOrders,
  markOrderReady,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  rejectOrder,
} from '../../api/workspace/orders';
import type { Driver, OnlineOrder, OrderGroup, OrderPayment, OrdersPage, OrderStatus } from '../../api/workspace/orders';
import { formatDateTime } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

/** La liste se rafraîchit seule : une commande qui attend, c'est un client qui attend. */
const POLL_MS = 15_000;

const STATUS_TONES: Record<OrderStatus, { color: string; background: string }> = {
  pending: { color: colors.iconAmber, background: colors.pastelAmber },
  accepted: { color: colors.iconBlue, background: colors.pastelBlue },
  ready: { color: colors.iconPurple, background: colors.pastelPurple },
  out_for_delivery: { color: colors.iconBlue, background: colors.pastelBlue },
  delivered: { color: colors.iconGreen, background: colors.pastelGreen },
  completed: { color: colors.iconGreen, background: colors.pastelGreen },
  rejected: { color: colors.textTertiary, background: colors.backgroundAlt },
  cancelled: { color: colors.textTertiary, background: colors.backgroundAlt },
};

const ACTIVE: OrderStatus[] = ['pending', 'accepted', 'ready', 'out_for_delivery'];

export function itemsSummary(order: OnlineOrder): string {
  return order.items.map((item) => `${item.quantity} ${item.dishName}`).join(', ');
}

/**
 * Commandes reçues sur le mini-site.
 *
 * Le caissier appelle le client, accepte, marque la commande prête, la
 * confie à un livreur, puis encaisse l'argent qu'il rapporte. Chaque étape
 * se voit côté client sur sa page de suivi.
 */
export function OrdersScreen() {
  const { can, money, notify, navigate, notifications, refreshBalance } = useWorkspace();
  const [group, setGroup] = useState<OrderGroup>('active');
  const [page, setPage] = useState<OrdersPage | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [siteOpen, setSiteOpen] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<OnlineOrder | null>(null);
  const [sheet, setSheet] = useState<'none' | 'reject' | 'cancel' | 'driver' | 'complete'>('none');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [orders, team] = await Promise.all([listOrders(group), listDrivers()]);
      setPage(orders);
      setDrivers(team);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement des commandes impossible.');
    } finally {
      setLoading(false);
    }
  }, [group]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Une notification de commande vient d'arriver : inutile d'attendre le prochain passage.
  const latestKind = notifications[0]?.kind;
  const latestId = notifications[0]?.id;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (latestKind?.startsWith('order.')) void load();
  }, [latestId, latestKind, load]);

  useEffect(() => {
    fetchOnlineSettings()
      .then((settings) => setSiteOpen(settings.enabled && settings.allowed))
      .catch(() => undefined);
  }, []);

  async function run(action: () => Promise<OnlineOrder>, message: string) {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await action();
      setSheet('none');
      // La fiche reste ouverte sur l'étape suivante, sauf si la commande est close.
      setDetail(ACTIVE.includes(updated.status) || updated.status === 'delivered' ? updated : null);
      notify(message);
      refreshBalance();
      void load();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !page) return <LoadingState label="Chargement des commandes…" />;
  if (error && !page) return <ErrorState message={error} onRetry={() => void load()} />;

  const orders = page?.data ?? [];
  const counts = page?.counts;
  const owed = drivers.filter((driver) => driver.toHandOver > 0 || driver.activeCount > 0);

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
        {siteOpen === false && (
          <Pressable
            onPress={() => can('settings.manage') && navigate('online')}
            accessibilityRole="button"
            style={styles.banner}
          >
            <Banner
              tone="warning"
              title="Commandes en ligne fermées"
              message={
                can('settings.manage')
                  ? 'Vos clients ne peuvent pas commander. Touchez ici pour ouvrir votre mini-site.'
                  : 'Vos clients ne peuvent pas commander pour le moment. Le gérant peut ouvrir le mini-site.'
              }
            />
          </Pressable>
        )}

        <View style={styles.filters}>
          <Chips
            bleed={screenPadding}
            options={[
              { value: 'active', label: 'À traiter', badge: counts?.active },
              { value: 'to_settle', label: 'À encaisser', badge: counts?.to_settle },
              { value: 'closed', label: 'Terminées (7 j)' },
            ]}
            value={group}
            onChange={setGroup}
          />
        </View>

        {owed.length > 0 && (
          <Card reveal={0} style={styles.drivers}>
            <SectionHeader title="Livreurs" caption="Courses en cours et argent à reverser" />
            {owed.map((driver, index) => (
              <View key={driver.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon="truck"
                  iconColor={colors.iconBlue}
                  iconBackground={colors.pastelBlue}
                  title={driver.fullName}
                  subtitle={`${driver.activeCount} course(s) en cours`}
                  value={money(driver.toHandOver)}
                  valueCaption={driver.toHandOver > 0 ? 'à reverser' : undefined}
                  valueTone={driver.toHandOver > 0 ? 'negative' : 'muted'}
                />
              </View>
            ))}
          </Card>
        )}

        {orders.length === 0 ? (
          <EmptyState
            icon="globe"
            title={group === 'active' ? 'Aucune commande à traiter' : group === 'to_settle' ? 'Rien à encaisser' : 'Aucune commande'}
            message={
              group === 'active'
                ? 'Les commandes passées sur votre mini-site arrivent ici, avec une notification sonore.'
                : group === 'to_settle'
                  ? 'Les commandes livrées dont l’argent n’est pas encore en caisse apparaissent ici.'
                  : 'Les commandes encaissées, refusées ou annulées des sept derniers jours.'
            }
          />
        ) : (
          <Card reveal={1}>
            {orders.map((order, index) => {
              const tone = STATUS_TONES[order.status];
              return (
                <View key={order.id}>
                  {index > 0 && <RowDivider />}
                  <ListRow
                    icon={order.mode === 'delivery' ? 'truck' : 'bag'}
                    iconColor={tone.color}
                    iconBackground={tone.background}
                    title={`${order.customerName} · ${order.reference.slice(-4)}`}
                    subtitle={`${itemsSummary(order)}\n${order.mode === 'delivery' ? (order.zoneName ?? 'Livraison') : 'À emporter'} · ${formatDateTime(order.createdAt)}`}
                    subtitleLines={2}
                    value={money(order.totalAmount)}
                    valueCaption={ORDER_STATUS_LABELS[order.status]}
                    valueTone={order.status === 'rejected' || order.status === 'cancelled' ? 'muted' : 'neutral'}
                    badge={order.deliveryIssue && order.status === 'ready' ? <View style={styles.issueDot} /> : undefined}
                    onPress={() => {
                      setActionError(null);
                      setDetail(order);
                    }}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <Sheet
        visible={Boolean(detail) && sheet === 'none'}
        title={detail ? `${detail.reference} · ${ORDER_STATUS_LABELS[detail.status]}` : ''}
        subtitle={detail ? (detail.mode === 'delivery' ? 'Livraison' : 'À emporter') : undefined}
        error={actionError}
        onClose={() => setDetail(null)}
        actions={detail ? <OrderActions order={detail} busy={busy} onRun={run} onOpen={(next) => {
          setActionError(null);
          setSheet(next);
        }} /> : undefined}
      >
        {detail && <OrderDetail order={detail} />}
      </Sheet>

      <ConfirmSheet
        visible={sheet === 'reject'}
        title="Refuser la commande"
        message="Le client verra votre motif sur sa page de suivi."
        confirmLabel="Refuser"
        reasonLabel="Motif"
        loading={busy}
        error={actionError}
        onCancel={() => setSheet('none')}
        onConfirm={(reason) => detail && void run(() => rejectOrder(detail.id, reason), 'Commande refusée')}
      />

      <ConfirmSheet
        visible={sheet === 'cancel'}
        title="Annuler la commande"
        message="Les portions réservées reviennent au menu. Le livreur est prévenu s’il en avait la charge."
        confirmLabel="Annuler la commande"
        reasonLabel="Motif"
        loading={busy}
        error={actionError}
        onCancel={() => setSheet('none')}
        onConfirm={(reason) => detail && void run(() => cancelOrder(detail.id, reason), 'Commande annulée')}
      />

      <DriverSheet
        visible={sheet === 'driver'}
        order={detail}
        drivers={drivers}
        busy={busy}
        error={actionError}
        onClose={() => setSheet('none')}
        onPick={(driverId) => detail && void run(() => assignDriver(detail.id, driverId), 'Commande confiée au livreur')}
      />

      <CompleteSheet
        visible={sheet === 'complete'}
        order={detail}
        busy={busy}
        error={actionError}
        onClose={() => setSheet('none')}
        onConfirm={(method) =>
          detail && void run(() => completeOrder(detail.id, method), 'Encaissé : la vente est enregistrée')
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fiche d'une commande
// ---------------------------------------------------------------------------

export function OrderDetail({ order, forDriver = false }: { order: OnlineOrder; forDriver?: boolean }) {
  const { money } = useWorkspace();
  return (
    <>
      {order.deliveryIssue && order.status === 'ready' && (
        <View style={styles.block}>
          <Banner tone="warning" title="Problème signalé par le livreur" message={order.deliveryIssue} />
        </View>
      )}
      {order.closedReason && (order.status === 'rejected' || order.status === 'cancelled') && (
        <View style={styles.block}>
          <Banner
            tone="danger"
            title={order.cancelledByCustomer ? 'Annulée par le client' : 'Motif'}
            message={order.closedReason}
          />
        </View>
      )}

      <View style={styles.customer}>
        <View style={styles.customerText}>
          <Text style={styles.customerName}>{order.customerName}</Text>
          <Text style={styles.customerPhone}>{order.customerPhone}</Text>
        </View>
        <Pressable
          onPress={() => void Linking.openURL(`tel:${order.customerPhone.replace(/\s/g, '')}`)}
          style={styles.callButton}
          accessibilityRole="button"
          accessibilityLabel={`Appeler ${order.customerName}`}
        >
          <Icon name="phone" size={16} color={colors.textOnPrimary} />
          <Text style={styles.callText}>Appeler</Text>
        </Pressable>
      </View>

      {order.mode === 'delivery' && (
        <View style={styles.address}>
          <Icon name="map-pin" size={16} color={colors.primary} />
          <View style={styles.customerText}>
            <Text style={styles.addressZone}>{order.zoneName ?? 'Livraison'}</Text>
            {Boolean(order.landmark) && <Text style={styles.addressLandmark}>{order.landmark}</Text>}
          </View>
        </View>
      )}

      {order.items.map((item, index) => (
        <View key={`${item.dishName}-${index}`} style={styles.line}>
          <Text style={styles.lineName}>
            {item.quantity} × {item.dishName}
          </Text>
          <Text style={styles.lineValue}>{money(item.lineTotal)}</Text>
        </View>
      ))}
      {order.deliveryFee > 0 && (
        <View style={styles.line}>
          <Text style={styles.lineName}>Livraison</Text>
          <Text style={styles.lineValue}>{money(order.deliveryFee)}</Text>
        </View>
      )}
      <View style={[styles.line, styles.totalLine]}>
        <Text style={styles.totalLabel}>{forDriver ? 'À encaisser' : 'Total'}</Text>
        <Text style={styles.totalValue}>{money(order.totalAmount)}</Text>
      </View>

      <DetailRow label="Paiement prévu" value={PAYMENT_LABELS[order.paymentMethod]} />
      {order.collectedMethod && <DetailRow label="Reçu en" value={PAYMENT_LABELS[order.collectedMethod]} />}
      {Boolean(order.note) && <DetailRow label="Remarque" value={order.note as string} />}
      {!forDriver && order.driver && <DetailRow label="Livreur" value={order.driver.fullName} />}
      <DetailRow label="Reçue le" value={formatDateTime(order.createdAt)} />
      {order.saleReference && <DetailRow label="Vente" value={order.saleReference} />}
    </>
  );
}

function OrderActions({
  order,
  busy,
  onRun,
  onOpen,
}: {
  order: OnlineOrder;
  busy: boolean;
  onRun: (action: () => Promise<OnlineOrder>, message: string) => void;
  onOpen: (sheet: 'reject' | 'cancel' | 'driver' | 'complete') => void;
}) {
  const delivery = order.mode === 'delivery';
  const cancellable = ACTIVE.includes(order.status);
  return (
    <>
      {order.status === 'pending' && (
        <>
          <Button label="Accepter (après l’appel)" onPress={() => onRun(() => acceptOrder(order.id), 'Commande acceptée')} loading={busy} />
          <Button label="Refuser" onPress={() => onOpen('reject')} variant="secondary" />
        </>
      )}
      {order.status === 'accepted' && (
        <Button label="Marquer prête" onPress={() => onRun(() => markOrderReady(order.id), 'Commande prête')} loading={busy} />
      )}
      {delivery && (order.status === 'accepted' || order.status === 'ready') && (
        <Button
          label={order.driver ? `Changer de livreur (${order.driver.fullName})` : 'Confier à un livreur'}
          onPress={() => onOpen('driver')}
          variant={order.status === 'ready' && !order.driver ? 'primary' : 'secondary'}
        />
      )}
      {!delivery && (order.status === 'accepted' || order.status === 'ready') && (
        <Button label="Remise au client : encaisser" onPress={() => onOpen('complete')} variant={order.status === 'ready' ? 'primary' : 'secondary'} />
      )}
      {order.status === 'delivered' && <Button label="Argent reçu du livreur : encaisser" onPress={() => onOpen('complete')} />}
      {cancellable && <Button label="Annuler la commande" onPress={() => onOpen('cancel')} variant="ghost" />}
    </>
  );
}

function DriverSheet({
  visible,
  order,
  drivers,
  busy,
  error,
  onClose,
  onPick,
}: {
  visible: boolean;
  order: OnlineOrder | null;
  drivers: Driver[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (driverId: string) => void;
}) {
  return (
    <Sheet
      visible={visible}
      title="Confier à un livreur"
      subtitle={order ? `${order.reference} · ${order.zoneName ?? ''}` : undefined}
      error={error}
      onClose={onClose}
    >
      {drivers.length === 0 ? (
        <Text style={styles.note}>
          Aucun livreur dans l’équipe. Le gérant en ajoute un dans Paramètres → Équipe, avec le rôle Livreur.
        </Text>
      ) : (
        drivers.map((driver, index) => (
          <View key={driver.id}>
            {index > 0 && <RowDivider />}
            <ListRow
              icon="truck"
              iconColor={colors.iconBlue}
              iconBackground={colors.pastelBlue}
              title={driver.fullName}
              subtitle={
                driver.activeCount === 0 ? 'Disponible' : `${driver.activeCount} course(s) en cours`
              }
              value={order?.driver?.id === driver.id ? 'Actuel' : busy ? '…' : 'Choisir'}
              valueTone={order?.driver?.id === driver.id ? 'muted' : 'neutral'}
              onPress={() => !busy && order?.driver?.id !== driver.id && onPick(driver.id)}
            />
          </View>
        ))
      )}
    </Sheet>
  );
}

function CompleteSheet({
  visible,
  order,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  order: OnlineOrder | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (method: OrderPayment | undefined) => void;
}) {
  const { money } = useWorkspace();
  const [method, setMethod] = useState<OrderPayment>('cash');

  useEffect(() => {
    if (visible && order) setMethod(order.collectedMethod ?? order.paymentMethod);
  }, [visible, order]);

  if (!order) return null;
  const delivery = order.mode === 'delivery';

  return (
    <Sheet
      visible={visible}
      title={delivery ? 'Argent reçu du livreur' : 'Encaisser la commande'}
      subtitle={`${order.reference} · ${order.customerName}`}
      error={error}
      onClose={onClose}
      actions={
        <Button
          label={`Encaisser ${money(order.totalAmount)}`}
          onPress={() => onConfirm(delivery ? undefined : method)}
          loading={busy}
        />
      }
    >
      {delivery ? (
        <Text style={styles.note}>
          {order.driver?.fullName ?? 'Le livreur'} vous remet {money(order.totalAmount)}{' '}
          {order.collectedMethod === 'mobile_money' ? 'reçus en Mobile Money' : 'en espèces'}. Vérifiez la somme : elle
          entre dans la caisse ouverte et la vente est enregistrée.
        </Text>
      ) : (
        <>
          <Text style={styles.note}>Le client paie au comptoir. La vente entre dans la caisse ouverte.</Text>
          <Chips
            options={[
              { value: 'cash', label: 'Espèces' },
              { value: 'mobile_money', label: 'Mobile Money' },
            ]}
            value={method}
            onChange={setMethod}
          />
        </>
      )}
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
  banner: {
    marginBottom: spacing.lg,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  drivers: {
    marginBottom: spacing.lg,
  },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  block: {
    marginBottom: spacing.md,
  },
  customer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  customerText: {
    flex: 1,
  },
  customerName: {
    ...typography.bodyStrong,
  },
  customerPhone: {
    ...typography.small,
    color: colors.textSecondary,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  callText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  address: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  addressZone: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  addressLandmark: {
    ...typography.small,
    color: colors.textSecondary,
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
    marginBottom: spacing.sm,
  },
  totalLabel: {
    ...typography.bodyStrong,
  },
  totalValue: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.primary,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    ...typography.small,
    color: colors.textTertiary,
  },
  detailValue: {
    ...typography.bodyStrong,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  note: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
});
