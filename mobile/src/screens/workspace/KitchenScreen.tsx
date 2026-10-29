import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { ApiError } from '../../api/client';
import { fetchKitchen, markReady, startTicket } from '../../api/workspace/tables';
import type { KitchenBoard, KitchenTicket } from '../../api/workspace/tables';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, shadows, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

/** La cuisine voit arriver les tickets sans rien toucher. */
const POLL_MS = 8_000;

/** Minutes écoulées depuis l'envoi, recalées sur l'horloge du serveur. */
function minutesSince(iso: string, skewMs: number): number {
  return Math.max(0, Math.floor((Date.now() - skewMs - new Date(iso).getTime()) / 60_000));
}

/**
 * L'écran cuisine, pensé pour une tablette posée sur le passe : gros
 * tickets, remarques bien visibles, chronomètre qui vire à l'orange puis
 * au rouge. Les commandes en ligne arrivent ici comme celles des tables.
 * Le cuisinier ne voit ni prix ni caisse.
 */
export function KitchenScreen() {
  const { notify, navigate, can } = useWorkspace();
  const [board, setBoard] = useState<KitchenBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const skew = useRef(0);

  const apply = useCallback((next: KitchenBoard) => {
    // Le chronomètre suit l'heure du serveur, pas celle de la tablette.
    skew.current = Date.now() - new Date(next.serverTime).getTime();
    setBoard(next);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await fetchKitchen());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement de la cuisine impossible.');
    }
  }, [apply]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    // Le chronomètre avance même sans nouveau ticket.
    const clock = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  async function run(id: string, action: () => Promise<KitchenBoard>, message: string) {
    setBusyId(id);
    try {
      apply(await action());
      notify(message);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'Action impossible.', 'danger');
      void load();
    } finally {
      setBusyId(null);
    }
  }

  if (error && !board) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!board) return <LoadingState label="Chargement de la cuisine…" />;

  const todo = board.data.filter((ticket) => ticket.status !== 'ready');
  const ready = board.data.filter((ticket) => ticket.status === 'ready');

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
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{todo.length}</Text>
        <Text style={styles.summaryLabel}>ticket(s) à préparer</Text>
        {can('menu.availability') && (
          <Pressable onPress={() => navigate('menu')} style={styles.menuLink} accessibilityRole="button">
            <Icon name="menu-book" size={14} color={colors.primary} />
            <Text style={styles.menuLinkText}>Marquer un plat épuisé</Text>
          </Pressable>
        )}
      </View>

      {todo.length === 0 ? (
        <EmptyState
          icon="flame"
          title="Rien à préparer"
          message="Les commandes des serveurs et du mini-site arrivent ici, avec une notification sonore."
        />
      ) : (
        <View style={styles.grid}>
          {todo.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              minutes={minutesSince(ticket.createdAt, skew.current)}
              warnMinutes={board.warnMinutes}
              lateMinutes={board.lateMinutes}
              busy={busyId === ticket.id}
              onStart={() => void run(ticket.id, () => startTicket(ticket.id), 'Préparation commencée')}
              onReadyAll={() => void run(ticket.id, () => markReady(ticket.id), 'Ticket prêt : le serveur est prévenu')}
              onReadyItem={(itemId) => void run(ticket.id, () => markReady(ticket.id, itemId), 'Plat prêt')}
            />
          ))}
        </View>
      )}

      {ready.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Prêts, en attente du serveur</Text>
          {ready.map((ticket) => (
            <View key={ticket.id} style={styles.readyRow}>
              <Icon name="check" size={16} color={colors.success} />
              <Text style={styles.readyText} numberOfLines={1}>
                {ticket.title} · {ticket.items.map((item) => `${item.quantity} ${item.dishName}`).join(', ')}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function TicketCard({
  ticket,
  minutes,
  warnMinutes,
  lateMinutes,
  busy,
  onStart,
  onReadyAll,
  onReadyItem,
}: {
  ticket: KitchenTicket;
  minutes: number;
  warnMinutes: number;
  lateMinutes: number;
  busy: boolean;
  onStart: () => void;
  onReadyAll: () => void;
  onReadyItem: (itemId: string) => void;
}) {
  const tone =
    minutes >= lateMinutes
      ? { color: colors.danger, background: colors.dangerSoft }
      : minutes >= warnMinutes
        ? { color: colors.warning, background: colors.warningSoft }
        : { color: colors.success, background: colors.successSoft };

  return (
    <View style={[styles.ticket, { borderTopColor: tone.color }]}>
      <View style={styles.ticketHead}>
        <View style={styles.ticketTitleBox}>
          <Text style={styles.ticketTitle} numberOfLines={2}>
            {ticket.title}
          </Text>
          <Text style={styles.ticketMeta}>
            {ticket.source === 'online' ? 'Commande en ligne' : (ticket.waiterName ?? 'Serveur')}
            {ticket.status === 'preparing' ? ' · en préparation' : ' · nouveau'}
          </Text>
        </View>
        <View style={[styles.timer, { backgroundColor: tone.background }]}>
          <Text style={[styles.timerText, { color: tone.color }]}>{minutes} min</Text>
        </View>
      </View>

      {ticket.items.map((item) => {
        const done = item.status === 'ready' || item.status === 'served';
        return (
          <Pressable
            key={item.id}
            onPress={() => !done && !busy && onReadyItem(item.id)}
            disabled={done || busy}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={`${item.dishName} prêt`}
          >
            <View style={[styles.check, done && styles.checkDone]}>
              {done && <Icon name="check" size={13} color={colors.textOnPrimary} strokeWidth={3} />}
            </View>
            <View style={styles.itemText}>
              <Text style={[styles.itemName, done && styles.itemDone]}>
                {item.quantity} × {item.dishName}
              </Text>
              {Boolean(item.note) && <Text style={styles.note}>« {item.note} »</Text>}
            </View>
          </Pressable>
        );
      })}

      <View style={styles.ticketActions}>
        {ticket.status === 'new' ? (
          <Button label="Je commence" onPress={onStart} loading={busy} variant="secondary" />
        ) : null}
        <Button label="Tout est prêt" onPress={onReadyAll} loading={busy && ticket.status !== 'new'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  summaryValue: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  menuLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  menuLinkText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  ticket: {
    flexGrow: 1,
    flexBasis: 280,
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopWidth: 5,
    padding: spacing.lg,
    ...shadows.medium,
  },
  ticketHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  ticketTitleBox: {
    flex: 1,
  },
  ticketTitle: {
    ...typography.h3,
    fontSize: 18,
    lineHeight: 24,
  },
  ticketMeta: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
  },
  timer: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  timerText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  itemDone: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  note: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
  },
  ticketActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyStrong,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  readyText: {
    ...typography.small,
    color: colors.textSecondary,
    flex: 1,
  },
});
