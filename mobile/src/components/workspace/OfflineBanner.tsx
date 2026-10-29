import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { ConfirmSheet } from './ConfirmSheet';
import { Sheet } from './Sheet';
import { discardSale, syncPending, useOffline } from '../../api/offline';
import type { OfflineSale } from '../../api/offline';
import { formatDateTime } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, spacing } from '../../theme/layout';

/**
 * Bandeau du mode hors connexion : il dit qu'internet est coupé, combien
 * de ventes attendent sur le téléphone, et passe au vert quand tout est
 * envoyé. Une vente refusée par le serveur reste visible, avec sa raison.
 */
export function OfflineBanner({ money }: { money: (value: number) => string }) {
  const { online, syncing, pending } = useOffline();
  const [open, setOpen] = useState(false);
  const [toDiscard, setToDiscard] = useState<OfflineSale | null>(null);

  const rejected = pending.filter((sale) => sale.rejected);
  const waiting = pending.length - rejected.length;
  if (online && pending.length === 0) return null;

  const tone = rejected.length > 0 ? colors.danger : online ? colors.info : colors.warning;
  const background = rejected.length > 0 ? colors.dangerSoft : online ? colors.infoSoft : colors.warningSoft;
  const text = !online
    ? `Hors connexion${waiting > 0 ? ` · ${waiting} vente(s) en attente d’envoi` : ' · ventes gardées sur ce téléphone'}`
    : syncing
      ? `Envoi de ${waiting} vente(s)…`
      : waiting > 0
        ? `${waiting} vente(s) en attente d’envoi`
        : `${rejected.length} vente(s) refusée(s) par le serveur`;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.banner, { backgroundColor: background }]}
        accessibilityRole="button"
      >
        <Icon name={online ? 'refresh' : 'alert'} size={15} color={tone} />
        <Text style={[styles.text, { color: tone }]} numberOfLines={1}>
          {text}
        </Text>
        <Icon name="chevron-right" size={14} color={tone} />
      </Pressable>

      <Sheet
        visible={open && !toDiscard}
        title={online ? 'Ventes à envoyer' : 'Hors connexion'}
        subtitle={
          online
            ? 'Elles partent seules ; vous pouvez aussi forcer l’envoi.'
            : 'Vous pouvez continuer à vendre au comptoir. Tout partira au retour d’internet.'
        }
        onClose={() => setOpen(false)}
        actions={
          waiting > 0 ? (
            <Button label="Envoyer maintenant" onPress={() => void syncPending()} loading={syncing} />
          ) : undefined
        }
      >
        {pending.length === 0 ? (
          <Text style={styles.empty}>Aucune vente en attente sur ce téléphone.</Text>
        ) : (
          pending.map((sale) => (
            <View key={sale.clientId} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {sale.offlineRef} · {money(sale.totalAmount)}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={2}>
                  {formatDateTime(sale.soldAt)} · {sale.items.map((item) => `${item.quantity} ${item.dishName}`).join(', ')}
                </Text>
                {sale.rejected && <Text style={styles.rowError}>Refusée : {sale.rejected}</Text>}
              </View>
              {sale.rejected && (
                <Pressable onPress={() => setToDiscard(sale)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retirer">
                  <Icon name="trash" size={16} color={colors.danger} />
                </Pressable>
              )}
            </View>
          ))
        )}
      </Sheet>

      <ConfirmSheet
        visible={Boolean(toDiscard)}
        title={`Retirer ${toDiscard?.offlineRef ?? ''}`}
        message="Cette vente refusée sera effacée du téléphone. Notez-la avant, et faites-la saisir par le gérant si l’argent a été encaissé."
        confirmLabel="Retirer du téléphone"
        onCancel={() => setToDiscard(null)}
        onConfirm={() => {
          if (toDiscard) void discardSale(toDiscard.clientId);
          setToDiscard(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
  },
  empty: {
    ...typography.small,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  rowMeta: {
    ...typography.small,
    fontSize: 12,
    color: colors.textTertiary,
  },
  rowError: {
    ...typography.small,
    fontSize: 12,
    color: colors.danger,
    marginTop: 2,
  },
});
