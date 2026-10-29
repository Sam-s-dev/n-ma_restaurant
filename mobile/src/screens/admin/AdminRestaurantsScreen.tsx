import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { PromptModal } from '../../components/PromptModal';
import { StatusBadge } from '../../components/StatusBadge';
import { TextField } from '../../components/TextField';
import { ApiError, mediaUrl, THUMB } from '../../api/client';
import {
  activateRestaurant,
  disableRestaurant,
  setOnlineAllowed,
  listRestaurants,
  stats as fetchStats,
} from '../../api/superadmin';
import type { AdminProfile, PlatformStats, RestaurantStatus, RestaurantSummary } from '../../api/superadmin';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { radius, screenPadding, shadows, spacing } from '../../theme/layout';

interface AdminRestaurantsScreenProps {
  token: string;
  admin: AdminProfile;
  onLogout: () => void;
  /** Appelé quand le jeton est refusé : la session doit être refaite. */
  onSessionExpired: () => void;
}

type Filter = 'pending' | 'active' | 'disabled' | 'all';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'pending', label: 'En attente' },
  { key: 'active', label: 'Actifs' },
  { key: 'disabled', label: 'Suspendus' },
  { key: 'all', label: 'Tous' },
];

type PendingAction =
  | { type: 'activate'; restaurant: RestaurantSummary }
  | { type: 'disable'; restaurant: RestaurantSummary }
  | null;

export function AdminRestaurantsScreen({
  token,
  admin,
  onLogout,
  onSessionExpired,
}: AdminRestaurantsScreenProps) {
  const insets = useSafeAreaInsets();

  // Les demandes en attente sont ce que l'éditeur vient traiter : c'est
  // le filtre par défaut.
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<RestaurantSummary[]>([]);
  const [counts, setCounts] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      setError(null);
      try {
        const [page, platform] = await Promise.all([
          listRestaurants(token, {
            ...(filter === 'all' ? {} : { status: filter as RestaurantStatus }),
            ...(search.trim() ? { search: search.trim() } : {}),
          }),
          fetchStats(token),
        ]);
        setItems(page.items);
        setCounts(platform);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          onSessionExpired();
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, filter, search, onSessionExpired],
  );

  useEffect(() => {
    // Petit délai : évite une requête à chaque frappe dans la recherche.
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  async function runAction(reason: string) {
    if (!action) return;
    setWorking(true);
    setError(null);
    try {
      const updated =
        action.type === 'activate'
          ? await activateRestaurant(token, action.restaurant.id, reason || undefined)
          : await disableRestaurant(token, action.restaurant.id, reason);

      setNotice(
        action.type === 'activate'
          ? `${updated.name} peut maintenant se connecter.`
          : `${updated.name} n’a plus accès à son espace.`,
      );
      setAction(null);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Opération impossible.');
      setAction(null);
    } finally {
      setWorking(false);
    }
  }

  async function toggleOnline(restaurant: RestaurantSummary) {
    setError(null);
    try {
      const updated = await setOnlineAllowed(token, restaurant.id, !restaurant.onlineAllowed);
      setNotice(
        updated.onlineAllowed
          ? `${updated.name} peut ouvrir son mini-site de commande.`
          : `Le mini-site de ${updated.name} est fermé.`,
      );
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Opération impossible.');
    }
  }

  const pendingCount = counts?.restaurants_pending ?? 0;

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.huge },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ silent: true });
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={typography.caption}>Console N’ma</Text>
                <Text style={[typography.h1, styles.headerTitle]}>Restaurants</Text>
                <Text style={typography.small}>Connecté en tant que {admin.fullName}</Text>
              </View>
              <Pressable onPress={onLogout} hitSlop={10} style={styles.logout}>
                <Text style={styles.logoutText}>Quitter</Text>
              </Pressable>
            </View>

            {counts && (
              <View style={styles.statRow}>
                <Stat label="En attente" value={counts.restaurants_pending} tone={colors.warning} />
                <Stat label="Actifs" value={counts.restaurants_active} tone={colors.success} />
                <Stat label="Suspendus" value={counts.restaurants_disabled} tone={colors.danger} />
              </View>
            )}

            {pendingCount > 0 && filter !== 'pending' && (
              <Banner
                tone="warning"
                title={`${pendingCount} demande${pendingCount > 1 ? 's' : ''} en attente`}
                message="Des restaurants attendent votre validation pour accéder à leur espace."
              />
            )}

            {Boolean(notice) && <Banner tone="success" message={notice as string} />}
            {Boolean(error) && <Banner tone="danger" message={error as string} />}

            <View style={styles.filters}>
              {FILTERS.map((entry) => {
                const active = filter === entry.key;
                return (
                  <Pressable
                    key={entry.key}
                    onPress={() => {
                      setFilter(entry.key);
                      setNotice(null);
                    }}
                    style={[styles.filter, active && styles.filterActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {entry.label}
                    </Text>
                    {entry.key === 'pending' && pendingCount > 0 && (
                      <View style={[styles.pill, active && styles.pillActive]}>
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>
                          {pendingCount}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <TextField
              label="Rechercher"
              placeholder="Nom du restaurant ou e-mail du gérant"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        }
        renderItem={({ item }) => (
          <RestaurantCard
            restaurant={item}
            onActivate={() => {
              setNotice(null);
              setAction({ type: 'activate', restaurant: item });
            }}
            onDisable={() => {
              setNotice(null);
              setAction({ type: 'disable', restaurant: item });
            }}
            onToggleOnline={() => void toggleOnline(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Text style={[typography.h3, styles.emptyTitle]}>
                {filter === 'pending' ? 'Aucune demande en attente' : 'Aucun restaurant'}
              </Text>
              <Text style={[typography.small, styles.emptyBody]}>
                {filter === 'pending'
                  ? 'Tout est traité. Les nouvelles inscriptions apparaîtront ici.'
                  : 'Aucun résultat pour ce filtre.'}
              </Text>
            </View>
          )
        }
      />

      <PromptModal
        visible={action?.type === 'activate'}
        title="Activer ce restaurant"
        message={`${action?.restaurant.name ?? ''} pourra se connecter immédiatement après validation.`}
        label="Motif (facultatif)"
        placeholder="Abonnement réglé, établissement vérifié…"
        confirmLabel="Activer"
        loading={working}
        onCancel={() => setAction(null)}
        onConfirm={runAction}
      />

      <PromptModal
        visible={action?.type === 'disable'}
        title="Suspendre ce restaurant"
        message={`${action?.restaurant.name ?? ''} sera déconnecté immédiatement, même en pleine utilisation. Ses données sont conservées.`}
        label="Motif (obligatoire)"
        placeholder="Abonnement expiré…"
        confirmLabel="Suspendre l’accès"
        minLength={3}
        destructive
        loading={working}
        onCancel={() => setAction(null)}
        onConfirm={runAction}
      />
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RestaurantCard({
  restaurant,
  onActivate,
  onDisable,
  onToggleOnline,
}: {
  restaurant: RestaurantSummary;
  onActivate: () => void;
  onDisable: () => void;
  onToggleOnline: () => void;
}) {
  const logo = mediaUrl(restaurant.logoMediaId, THUMB.small);
  const initials = restaurant.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  const createdAt = new Date(restaurant.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.logo} resizeMode="cover" />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoFallbackText}>{initials}</Text>
          </View>
        )}

        <View style={styles.cardHead}>
          <Text style={[typography.h3, styles.cardName]} numberOfLines={1}>
            {restaurant.name}
          </Text>
          <Text style={typography.small} numberOfLines={1}>
            {restaurant.ownerName ?? 'Gérant inconnu'}
          </Text>
          <Text style={[typography.small, styles.email]} numberOfLines={1}>
            {restaurant.ownerEmail ?? '—'}
          </Text>
        </View>

        <StatusBadge status={restaurant.status} />
      </View>

      <View style={styles.meta}>
        <Meta label="Inscrit le" value={createdAt} />
        <Meta label="Utilisateurs" value={String(restaurant.usersCount)} />
        <Meta label="Ventes" value={String(restaurant.salesCount)} />
        <Meta
          label="Mini-site"
          value={!restaurant.onlineAllowed ? 'Interdit' : restaurant.onlineEnabled ? 'Ouvert' : 'Fermé'}
        />
      </View>

      {Boolean(restaurant.statusReason) && restaurant.status === 'disabled' && (
        <Text style={styles.reason}>Motif : {restaurant.statusReason}</Text>
      )}

      <View style={styles.cardActions}>
        {restaurant.status === 'active' ? (
          <Button label="Suspendre l’accès" onPress={onDisable} variant="secondary" />
        ) : (
          <Button label="Activer le compte" onPress={onActivate} variant="primary" />
        )}
        <Button
          label={restaurant.onlineAllowed ? 'Interdire le mini-site' : 'Autoriser le mini-site'}
          onPress={onToggleOnline}
          variant="ghost"
        />
      </View>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: screenPadding,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    marginTop: spacing.xs,
    marginBottom: 2,
  },
  logout: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  logoutText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },

  statRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statValue: {
    ...typography.h1,
    fontSize: 24,
    lineHeight: 30,
  },
  statLabel: {
    ...typography.small,
    fontSize: 12,
    marginTop: 2,
  },

  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.button,
    fontSize: 13,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.textOnPrimary,
  },
  pill: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  pillText: {
    ...typography.button,
    fontSize: 11,
    lineHeight: 15,
    color: '#FFFFFF',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.soft,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
  },
  logoFallback: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    ...typography.button,
    fontSize: 15,
    color: colors.primary,
  },
  cardHead: {
    flex: 1,
  },
  cardName: {
    marginBottom: 1,
  },
  email: {
    color: colors.textTertiary,
  },

  meta: {
    flexDirection: 'row',
    gap: spacing.xxl,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metaItem: {},
  metaLabel: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
  },
  metaValue: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  reason: {
    ...typography.small,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    color: colors.textPrimary,
  },
  cardActions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },

  loader: {
    marginTop: spacing.huge,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
