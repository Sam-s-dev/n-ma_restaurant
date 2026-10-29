import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { ApiError } from '../../api/client';
import { cancelTrackedOrder, trackOrder } from '../../api/public';
import type { TrackedOrder } from '../../api/public';
import { PAYMENT_LABELS } from '../../api/workspace/orders';
import { formatDateTime } from '../../utils/date';
import { formatMoney } from '../../utils/money';
import { rememberOrder, trackingUrl } from '../../utils/publicRoute';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { maxContentWidth, radius, spacing } from '../../theme/layout';

/** Le suivi se met à jour seul tant que la commande avance. */
const POLL_MS = 15_000;

const FINAL = new Set(['completed', 'rejected', 'cancelled']);

interface Step {
  label: string;
  at: string | null;
}

function stepsOf(order: TrackedOrder): Step[] {
  const steps: Step[] = [
    { label: 'Commande reçue', at: order.createdAt },
    { label: 'Confirmée, en préparation', at: order.acceptedAt },
    { label: order.mode === 'delivery' ? 'Prête' : 'Prête à retirer', at: order.readyAt },
  ];
  if (order.mode === 'delivery') {
    steps.push({ label: 'En route', at: order.dispatchedAt });
    steps.push({ label: 'Livrée', at: order.deliveredAt });
  } else {
    steps.push({ label: 'Retirée', at: order.deliveredAt });
  }
  return steps;
}

const HEADLINES: Record<string, string> = {
  pending: 'Le restaurant va vous appeler pour confirmer.',
  accepted: 'Votre commande est en préparation.',
  ready: 'Votre commande est prête.',
  out_for_delivery: 'Votre commande est en route.',
  delivered: 'Commande livrée. Bon appétit !',
  completed: 'Commande terminée. Bon appétit !',
  rejected: 'Le restaurant n’a pas pu accepter votre commande.',
  cancelled: 'Commande annulée.',
};

interface OrderTrackingScreenProps {
  code: string;
  onBackToMenu: (slug: string) => void;
}

export function OrderTrackingScreen({ code, onBackToMenu }: OrderTrackingScreenProps) {
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await trackOrder(code);
      setOrder(next);
      setError(null);
      // Ouverte depuis un lien reçu sur WhatsApp, elle rejoint « Mes commandes ».
      if (next.restaurant.slug) {
        rememberOrder({
          code: next.trackingCode,
          slug: next.restaurant.slug,
          reference: next.reference,
          createdAt: next.createdAt,
        });
      }
      if (typeof document !== 'undefined') document.title = `Commande ${next.reference} · ${next.restaurant.name}`;
    } catch (cause) {
      // Une coupure passagère ne doit pas effacer la commande déjà affichée.
      setOrder((current) => {
        if (!current) {
          setError(
            cause instanceof ApiError && cause.status === 404
              ? 'Commande introuvable. Vérifiez le lien reçu.'
              : 'Chargement impossible. Vérifiez votre connexion.',
          );
        }
        return current;
      });
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const finished = order ? FINAL.has(order.status) : false;
  useEffect(() => {
    if (finished) return undefined;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [finished, load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!order) return <LoadingState label="Chargement de votre commande…" />;

  const money = (value: number) =>
    formatMoney(value, { symbol: order.restaurant.currencySymbol, decimals: order.restaurant.currencyDecimals });
  const closed = order.status === 'rejected' || order.status === 'cancelled';
  const steps = stepsOf(order);
  const reached = steps.filter((step) => step.at).length;

  const link = trackingUrl(code);

  function sendToWhatsApp() {
    const text = `Ma commande ${order!.reference} chez ${order!.restaurant.name} : ${link}`;
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }

  async function copyLink() {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(link).catch(() => undefined);
      setCopied(true);
    }
  }

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      setOrder(await cancelTrackedOrder(code));
      setCancelOpen(false);
    } catch (cause) {
      setCancelError(cause instanceof ApiError ? cause.message : 'Annulation impossible.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.restaurant}>{order.restaurant.name}</Text>
      <Text style={styles.title}>Commande {order.reference}</Text>
      <Text style={styles.headline}>{HEADLINES[order.status]}</Text>

      {closed ? (
        <Banner
          tone="danger"
          title={order.status === 'rejected' ? 'Commande refusée' : 'Commande annulée'}
          message={order.closedReason ?? 'Appelez le restaurant pour en savoir plus.'}
        />
      ) : (
        <Card style={styles.card}>
          {steps.map((step, index) => {
            const done = Boolean(step.at);
            const currentStep = index === reached - 1 && !finished;
            return (
              <View key={step.label} style={styles.step}>
                <View style={styles.rail}>
                  <View style={[styles.dot, done && styles.dotDone, currentStep && styles.dotCurrent]}>
                    {done && <Icon name="check" size={11} color={colors.textOnPrimary} strokeWidth={3} />}
                  </View>
                  {index < steps.length - 1 && <View style={[styles.bar, done && steps[index + 1]?.at ? styles.barDone : null]} />}
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepLabel, !done && styles.stepLabelTodo]}>{step.label}</Text>
                  {step.at && <Text style={styles.stepTime}>{formatDateTime(step.at)}</Text>}
                  {step.label === 'En route' && order.driverName && done && (
                    <Text style={styles.stepTime}>Votre livreur : {order.driverName}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <Card style={styles.card}>
        {order.items.map((item) => (
          <View key={item.dishName} style={styles.line}>
            <Text style={styles.lineName}>
              {item.quantity} × {item.dishName}
            </Text>
            <Text style={styles.lineValue}>{money(item.lineTotal)}</Text>
          </View>
        ))}
        {order.deliveryFee > 0 && (
          <View style={styles.line}>
            <Text style={styles.lineName}>Livraison{order.zoneName ? ` · ${order.zoneName}` : ''}</Text>
            <Text style={styles.lineValue}>{money(order.deliveryFee)}</Text>
          </View>
        )}
        <View style={[styles.line, styles.totalLine]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{money(order.totalAmount)}</Text>
        </View>
        <Text style={styles.meta}>
          {PAYMENT_LABELS[order.paymentMethod]} {order.mode === 'delivery' ? 'à la livraison' : 'sur place'}
          {order.landmark ? ` · ${order.landmark}` : ''}
        </Text>
      </Card>

      {!finished && (
        <Text style={styles.hint}>
          Cette page se met à jour toute seule. Vous la retrouverez en rouvrant le lien du restaurant sur ce
          téléphone ; envoyez-vous le lien pour la retrouver ailleurs.
        </Text>
      )}

      <View style={styles.keep}>
        <Pressable onPress={sendToWhatsApp} style={styles.keepButton} accessibilityRole="button">
          <Icon name="send" size={15} color={colors.success} />
          <Text style={[styles.keepText, { color: colors.success }]}>Envoyer sur WhatsApp</Text>
        </Pressable>
        {Platform.OS === 'web' && (
          <Pressable onPress={() => void copyLink()} style={styles.keepButton} accessibilityRole="button">
            <Icon name={copied ? 'check' : 'receipt'} size={15} color={colors.primary} />
            <Text style={styles.keepText}>{copied ? 'Lien copié' : 'Copier le lien'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.actions}>
        {Boolean(order.restaurant.phone) && (
          <Button
            label={`Appeler le restaurant · ${order.restaurant.phone}`}
            onPress={() => void Linking.openURL(`tel:${order.restaurant.phone}`)}
            variant="secondary"
          />
        )}
        {order.status === 'pending' && (
          <Button label="Annuler ma commande" onPress={() => setCancelOpen(true)} variant="ghost" />
        )}
        {order.restaurant.slug && (finished || closed) && (
          <Button label="Commander à nouveau" onPress={() => onBackToMenu(order.restaurant.slug!)} />
        )}
      </View>

      <ConfirmSheet
        visible={cancelOpen}
        title="Annuler la commande"
        message="Le restaurant sera prévenu. Vous pourrez commander à nouveau quand vous voulez."
        confirmLabel="Annuler la commande"
        loading={cancelling}
        error={cancelError}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => void cancel()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.huge,
  },
  restaurant: {
    ...typography.small,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  title: {
    ...typography.h2,
    marginTop: 2,
  },
  headline: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rail: {
    alignItems: 'center',
    width: 20,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  dotCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  bar: {
    width: 2,
    flex: 1,
    minHeight: 22,
    backgroundColor: colors.border,
  },
  barDone: {
    backgroundColor: colors.success,
  },
  stepText: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  stepLabel: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  stepLabelTodo: {
    color: colors.textTertiary,
    fontFamily: fontFamily.regular,
  },
  stepTime: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
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
  meta: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.small,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  actions: {
    gap: spacing.md,
  },
  keep: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  keepButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  keepText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
  },
});
