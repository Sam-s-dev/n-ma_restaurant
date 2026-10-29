import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { IconName } from '../../components/Icon';
import { Chips } from '../../components/workspace/Chips';
import { EmptyState, ListRow, RowDivider } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { ApiError } from '../../api/client';
import { listAudit } from '../../api/workspace/audit';
import type { AuditEntry, AuditFamily, AuditPage } from '../../api/workspace/audit';
import { ROLE_LABELS } from '../../api/permissions';
import type { Role } from '../../api/permissions';
import { formatDateTime } from '../../utils/date';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const FILTERS: Array<{ value: 'all' | AuditFamily; label: string }> = [
  { value: 'all', label: 'Tout' },
  { value: 'sale', label: 'Ventes' },
  { value: 'cash', label: 'Caisse' },
  { value: 'expense', label: 'Dépenses' },
  { value: 'dish', label: 'Menu' },
  { value: 'salary', label: 'Salaires' },
  { value: 'member', label: 'Équipe' },
  { value: 'order', label: 'Commandes' },
];

const PAGE_SIZE = 40;

interface ActionStyle {
  title: string;
  icon: IconName;
  color: string;
  background: string;
}

const NEUTRAL = { color: colors.textSecondary, background: colors.backgroundAlt };
const DANGER = { color: colors.iconRed, background: colors.pastelRed };
const MONEY = { color: colors.iconGreen, background: colors.pastelGreen };
const TEAM = { color: colors.iconBlue, background: colors.pastelBlue };

const ACTIONS: Record<string, ActionStyle> = {
  'sale.cancelled': { title: 'Vente annulée', icon: 'close', ...DANGER },
  'cash.adjusted': { title: 'Correction de caisse', icon: 'wallet', ...DANGER },
  'cash.contribution': { title: 'Apport ou retrait du gérant', icon: 'wallet', ...MONEY },
  'credit.repaid': { title: 'Remboursement encaissé', icon: 'credit', ...MONEY },
  'customer.deleted': { title: 'Fiche client supprimée', icon: 'user', ...NEUTRAL },
  'expense.created': { title: 'Dépense enregistrée', icon: 'receipt', ...NEUTRAL },
  'expense.cancelled': { title: 'Dépense annulée', icon: 'close', ...DANGER },
  'dish.created': { title: 'Plat ajouté au menu', icon: 'menu-book', ...NEUTRAL },
  'dish.updated': { title: 'Plat modifié', icon: 'edit', ...NEUTRAL },
  'dish.deleted': { title: 'Plat retiré du menu', icon: 'trash', ...NEUTRAL },
  'stock.adjusted': { title: 'Correction de stock', icon: 'box', ...NEUTRAL },
  'stock_item.deleted': { title: 'Produit retiré du stock', icon: 'trash', ...NEUTRAL },
  'employee.created': { title: 'Employé ajouté', icon: 'users', ...TEAM },
  'employee.updated': { title: 'Fiche employé modifiée', icon: 'users', ...TEAM },
  'employee.deleted': { title: 'Employé retiré', icon: 'users', ...TEAM },
  'salary.paid': { title: 'Salaire versé', icon: 'users', ...MONEY },
  'salary.cancelled': { title: 'Versement de salaire annulé', icon: 'close', ...DANGER },
  'member.created': { title: 'Compte créé', icon: 'user', ...TEAM },
  'member.updated': { title: 'Compte modifié', icon: 'user', ...TEAM },
  'member.removed': { title: 'Compte retiré', icon: 'user', ...TEAM },
  'settings.updated': { title: 'Informations du restaurant modifiées', icon: 'settings', ...NEUTRAL },
  'order.accepted': { title: 'Commande en ligne acceptée', icon: 'globe', ...NEUTRAL },
  'order.rejected': { title: 'Commande en ligne refusée', icon: 'close', ...DANGER },
  'order.assigned': { title: 'Commande confiée au livreur', icon: 'truck', ...TEAM },
  'order.cancelled': { title: 'Commande en ligne annulée', icon: 'close', ...DANGER },
  'order.completed': { title: 'Commande en ligne encaissée', icon: 'globe', ...MONEY },
  'delivery.delivered': { title: 'Livraison effectuée', icon: 'truck', ...MONEY },
  'delivery.issue': { title: 'Problème de livraison', icon: 'truck', ...DANGER },
  'table.created': { title: 'Table ajoutée', icon: 'grid', ...NEUTRAL },
  'table.updated': { title: 'Table modifiée', icon: 'grid', ...NEUTRAL },
  'table.deleted': { title: 'Table retirée', icon: 'grid', ...NEUTRAL },
  'bill.opened': { title: 'Addition ouverte', icon: 'receipt', ...NEUTRAL },
  'bill.paid': { title: 'Addition encaissée', icon: 'receipt', ...MONEY },
  'bill.cancelled': { title: 'Addition annulée', icon: 'close', ...DANGER },
  'bill.item_cancelled': { title: 'Plat annulé sur une addition', icon: 'close', ...DANGER },
  'kitchen.settings_updated': { title: 'Seuils de la cuisine modifiés', icon: 'flame', ...NEUTRAL },
  'online.settings_updated': { title: 'Mini-site modifié', icon: 'globe', ...NEUTRAL },
  'online.zone_created': { title: 'Zone de livraison ajoutée', icon: 'map-pin', ...NEUTRAL },
  'online.zone_updated': { title: 'Zone de livraison modifiée', icon: 'map-pin', ...NEUTRAL },
  'online.zone_deleted': { title: 'Zone de livraison supprimée', icon: 'map-pin', ...NEUTRAL },
};

/**
 * Journal d'activité : les actions sensibles, de la plus récente à la plus
 * ancienne, avec leur auteur. Le gérant y retrouve qui a annulé une vente,
 * corrigé la caisse ou changé un prix — et pour quel motif.
 */
export function AuditScreen() {
  const { money } = useWorkspace();

  const [filter, setFilter] = useState<'all' | AuditFamily>('all');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (pageNumber: number) =>
      listAudit({
        page: pageNumber,
        limit: PAGE_SIZE,
        ...(filter === 'all' ? {} : { action: filter }),
      }),
    [filter],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const first = await fetchPage(1);
      setPage(first);
      setEntries(first.items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement du journal impossible.');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function loadMore() {
    if (!page || page.page >= page.pages) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(page.page + 1);
      setPage(next);
      setEntries((current) => [...current, ...next.items]);
    } catch {
      // La première page reste affichée ; un nouvel essai suffit.
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <LoadingState label="Chargement du journal…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const hasMore = Boolean(page && page.page < page.pages);

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
      <Text style={styles.intro}>
        Chaque action sensible laisse une trace : qui, quand, et pourquoi. Rien ne s’y efface.
      </Text>

      <View style={styles.filters}>
        <Chips bleed={screenPadding} options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {entries.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Rien pour l’instant"
          message="Les annulations, corrections de caisse, changements de prix et de rôle apparaîtront ici."
        />
      ) : (
        <Card reveal={0}>
          {entries.map((entry, index) => {
            const style = ACTIONS[entry.action] ?? {
              title: entry.action,
              icon: 'clock' as const,
              ...NEUTRAL,
            };
            const summary = describe(entry, money);
            return (
              <View key={entry.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon={style.icon}
                  iconColor={style.color}
                  iconBackground={style.background}
                  title={style.title}
                  subtitle={`${entry.userName} · ${roleLabel(entry.userRole)}${
                    summary ? `\n${summary}` : ''
                  }`}
                  subtitleLines={3}
                  value={formatDateTime(entry.createdAt)}
                  valueTone="muted"
                />
              </View>
            );
          })}
        </Card>
      )}

      {hasMore && (
        <View style={styles.more}>
          <Button
            label="Afficher plus"
            onPress={() => void loadMore()}
            loading={loadingMore}
            variant="secondary"
          />
        </View>
      )}
    </ScrollView>
  );
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

/**
 * Résumé lisible des détails conservés : la référence, le montant, le
 * motif. On n'affiche que ce qui aide à comprendre l'action.
 */
function describe(entry: AuditEntry, money: (value: number) => string): string {
  const d = entry.details;
  const parts: string[] = [];

  const text = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : null);
  const amount = typeof d.amount === 'number' ? d.amount : typeof d.totalAmount === 'number' ? d.totalAmount : null;

  const label = text('reference') ?? text('name') ?? text('fullName');
  if (label) parts.push(label);
  if (typeof d.price === 'number') parts.push(`prix ${money(d.price)}`);
  if (amount !== null) {
    const sign = d.direction === 'out' ? '− ' : d.direction === 'in' ? '+ ' : '';
    parts.push(`${sign}${money(amount)}`);
  }
  if (text('role')) parts.push(`rôle : ${roleLabel(text('role') as string)}`);
  if (d.isActive === false) parts.push('accès suspendu');
  if (d.isActive === true) parts.push('accès rétabli');

  const reason = text('reason') ?? text('label') ?? text('description') ?? text('note');
  if (reason) parts.push(`« ${reason} »`);

  return parts.join(' · ');
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.huge,
  },
  intro: {
    ...typography.small,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  more: {
    marginTop: spacing.lg,
  },
});
