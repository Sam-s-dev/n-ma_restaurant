import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips, Segmented } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { SearchField } from '../../components/workspace/SearchField';
import { Sheet } from '../../components/workspace/Sheet';
import { ApiError } from '../../api/client';
import {
  MOVEMENT_REASONS,
  STOCK_UNITS,
  UNIT_LABELS,
  adjustStock,
  createStockItem,
  deleteStockItem,
  listStock,
  listStockMovements,
  updateStockItem,
} from '../../api/workspace/stock';
import type { StockItem, StockList, StockMovement } from '../../api/workspace/stock';
import { formatQuantity, parseAmount } from '../../utils/money';
import { formatDateTime } from '../../utils/date';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

const unitLabel = (unit: string) => UNIT_LABELS[unit] ?? unit;

/**
 * §6 — Stock des matières premières.
 *
 * On ne saisit ici que les corrections d'inventaire et les pertes : un
 * achat passe par le module Dépenses, pour que la quantité entre en stock
 * et que la caisse soit débitée dans la même opération (§9).
 */
export function StockScreen() {
  const { money, navigate, notify } = useWorkspace();

  const [data, setData] = useState<StockList | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<StockItem | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; item: StockItem | null }>({
    open: false,
    item: null,
  });
  const [toDelete, setToDelete] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await listStock({
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(filter === 'low' ? { onlyLow: true } : {}),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement du stock impossible.');
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  // La recherche se déclenche après une courte pause : sans cela, chaque
  // lettre tapée partirait en requête.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteStockItem(toDelete.id);
      setToDelete(null);
      notify('Produit retiré');
      await load();
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? cause.message : 'Suppression impossible.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState label="Chargement du stock…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const items = data?.items ?? [];

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
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Valeur du stock</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {money(data?.summary.totalValue ?? 0)}
              </Text>
            </View>
            <View style={styles.summarySeparator} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Alertes</Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: (data?.summary.lowCount ?? 0) > 0 ? colors.warning : colors.success },
                ]}
              >
                {data?.summary.lowCount ?? 0} produit(s)
              </Text>
            </View>
          </View>
        </Card>

        <SearchField value={search} onChangeText={setSearch} placeholder="Rechercher un produit…" />

        <View style={styles.filters}>
          <Segmented
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'low', label: 'Sous le seuil' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => setEditing({ open: true, item: null })}
            accessibilityRole="button"
          >
            <Icon name="plus" size={16} color={colors.textOnPrimary} strokeWidth={2.5} />
            <Text style={styles.actionText}>Nouveau produit</Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.actionSecondary]}
            onPress={() => navigate('expenses')}
            accessibilityRole="button"
          >
            <Icon name="receipt" size={16} color={colors.primary} strokeWidth={2.2} />
            <Text style={[styles.actionText, styles.actionTextSecondary]}>Enregistrer un achat</Text>
          </Pressable>
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon="box"
            title={search || filter === 'low' ? 'Aucun résultat' : 'Stock vide'}
            message={
              search || filter === 'low'
                ? 'Aucun produit ne correspond à ce filtre.'
                : 'Listez vos matières premières pour suivre les quantités et être alerté avant la rupture.'
            }
            action={
              !search && filter === 'all' ? (
                <Button
                  label="Ajouter un produit"
                  onPress={() => setEditing({ open: true, item: null })}
                />
              ) : undefined
            }
          />
        ) : (
          <Card reveal={1}>
            {items.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <RowDivider />}
                <ListRow
                  icon={item.isLow ? 'alert' : 'box'}
                  iconColor={item.isLow ? colors.iconAmber : colors.iconBlue}
                  iconBackground={item.isLow ? colors.pastelAmber : colors.pastelBlue}
                  title={item.name}
                  subtitle={`Seuil : ${formatQuantity(item.alertThreshold, unitLabel(item.unit))} · ${money(item.purchasePrice)}/${unitLabel(item.unit)}`}
                  value={formatQuantity(item.quantity, unitLabel(item.unit))}
                  valueTone={item.isLow ? 'negative' : 'neutral'}
                  valueCaption={money(item.stockValue)}
                  onPress={() => setSelected(item)}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <ItemDetailSheet
        item={selected}
        onClose={() => setSelected(null)}
        onEdit={(item) => {
          setSelected(null);
          setEditing({ open: true, item });
        }}
        onDelete={(item) => {
          setSelected(null);
          setDeleteError(null);
          setToDelete(item);
        }}
        onDone={(message) => {
          setSelected(null);
          notify(message);
          void load();
        }}
      />

      <ItemFormSheet
        visible={editing.open}
        item={editing.item}
        onClose={() => setEditing({ open: false, item: null })}
        onDone={(message) => {
          setEditing({ open: false, item: null });
          notify(message);
          void load();
        }}
      />

      <ConfirmSheet
        visible={Boolean(toDelete)}
        title="Retirer le produit"
        message={`« ${toDelete?.name ?? ''} » ne sera plus suivi. S’il apparaît dans des achats passés, il est archivé plutôt que supprimé.`}
        confirmLabel="Retirer"
        loading={deleting}
        error={deleteError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  );
}

interface ItemDetailSheetProps {
  item: StockItem | null;
  onClose: () => void;
  onEdit: (item: StockItem) => void;
  onDelete: (item: StockItem) => void;
  onDone: (message: string) => void;
}

/** Fiche produit : correction de quantité et historique des mouvements. */
function ItemDetailSheet({ item, onClose, onEdit, onDelete, onDone }: ItemDetailSheetProps) {
  const { money } = useWorkspace();
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<'adjustment' | 'loss'>('adjustment');
  const [note, setNote] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setDirection('out');
    setQuantity('');
    setReason('adjustment');
    setNote('');
    setError(null);
    setQuantityError(undefined);
    setMovements([]);

    listStockMovements(item.id)
      .then(setMovements)
      .catch(() => undefined);
  }, [item]);

  async function submit() {
    if (!item) return;
    const value = parseAmount(quantity);
    if (value === null || value <= 0) {
      setQuantityError('Saisissez une quantité supérieure à zéro.');
      return;
    }

    setQuantityError(undefined);
    setSaving(true);
    setError(null);
    try {
      await adjustStock(item.id, {
        direction,
        quantity: value,
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onDone('Stock corrigé');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Correction impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={Boolean(item)}
      title={item?.name ?? ''}
      subtitle={
        item
          ? `${formatQuantity(item.quantity, unitLabel(item.unit))} en stock · ${money(item.stockValue)}`
          : undefined
      }
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button label="Enregistrer la correction" onPress={submit} loading={saving} />
          {item && (
            <View style={styles.sheetSecondaryRow}>
              <Pressable onPress={() => onEdit(item)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.sheetLink}>Modifier la fiche</Text>
              </Pressable>
              <Pressable onPress={() => onDelete(item)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.sheetLink, styles.sheetLinkDanger]}>Retirer</Text>
              </Pressable>
            </View>
          )}
        </>
      }
    >
      <Text style={styles.blockLabel}>Correction d’inventaire</Text>
      <Segmented
        options={[
          { value: 'out', label: 'Retirer' },
          { value: 'in', label: 'Ajouter' },
        ]}
        value={direction}
        onChange={setDirection}
        style={styles.spaced}
      />

      <AmountField
        label="Quantité"
        value={quantity}
        onChangeText={(value) => {
          setQuantity(value);
          if (quantityError) setQuantityError(undefined);
        }}
        placeholder="0"
        suffix={item ? unitLabel(item.unit) : undefined}
        error={quantityError}
      />

      <Text style={styles.blockLabel}>Raison</Text>
      <View style={styles.spaced}>
        <Chips
          options={[
            { value: 'adjustment', label: 'Correction' },
            { value: 'loss', label: 'Perte' },
          ]}
          value={reason}
          onChange={setReason}
        />
      </View>

      <Field
        label="Note (facultatif)"
        value={note}
        onChangeText={setNote}
        placeholder="Inventaire du soir"
      />

      {movements.length > 0 && (
        <>
          <SectionHeader title="Derniers mouvements" caption={`${movements.length} écriture(s)`} />
          {movements.slice(0, 12).map((movement, index) => (
            <View key={movement.id}>
              {index > 0 && <RowDivider />}
              <ListRow
                icon={movement.direction === 'in' ? 'arrow-down' : 'arrow-up'}
                iconColor={movement.direction === 'in' ? colors.iconGreen : colors.iconRed}
                iconBackground={
                  movement.direction === 'in' ? colors.pastelGreen : colors.pastelRed
                }
                title={MOVEMENT_REASONS[movement.reason] ?? movement.reason}
                subtitle={`${formatDateTime(movement.occurredAt)}${movement.note ? ` · ${movement.note}` : ''}`}
                value={`${movement.direction === 'in' ? '+' : '−'} ${formatQuantity(movement.quantity)}`}
                valueTone={movement.direction === 'in' ? 'positive' : 'negative'}
                valueCaption={`reste ${formatQuantity(movement.quantityAfter)}`}
              />
            </View>
          ))}
        </>
      )}
    </Sheet>
  );
}

interface ItemFormSheetProps {
  visible: boolean;
  item: StockItem | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

function ItemFormSheet({ visible, item, onClose, onDone }: ItemFormSheetProps) {
  const { currency } = useWorkspace();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<string>('kg');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [threshold, setThreshold] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? '');
    setUnit(item?.unit ?? 'kg');
    setQuantity(item ? String(item.quantity) : '');
    setPrice(item ? String(item.purchasePrice) : '');
    setThreshold(item ? String(item.alertThreshold) : '');
    setNameError(undefined);
    setError(null);
  }, [visible, item]);

  async function submit() {
    if (name.trim().length < 1) {
      setNameError('Donnez un nom au produit.');
      return;
    }
    setNameError(undefined);
    setSaving(true);
    setError(null);

    try {
      if (item) {
        await updateStockItem(item.id, {
          name: name.trim(),
          unit,
          purchasePrice: parseAmount(price) ?? 0,
          alertThreshold: parseAmount(threshold) ?? 0,
        });
        onDone('Produit mis à jour');
      } else {
        await createStockItem({
          name: name.trim(),
          unit,
          quantity: parseAmount(quantity) ?? 0,
          purchasePrice: parseAmount(price) ?? 0,
          alertThreshold: parseAmount(threshold) ?? 0,
        });
        onDone('Produit ajouté');
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={item ? 'Modifier le produit' : 'Nouveau produit'}
      error={error}
      onClose={onClose}
      actions={<Button label="Enregistrer" onPress={submit} loading={saving} />}
    >
      <Field
        label="Nom du produit"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (nameError) setNameError(undefined);
        }}
        placeholder="Riz"
        error={nameError}
      />

      <Text style={styles.blockLabel}>Unité</Text>
      <View style={styles.spaced}>
        <Chips
          options={STOCK_UNITS.map((value) => ({ value, label: unitLabel(value) }))}
          value={unit}
          onChange={setUnit}
        />
      </View>

      {!item && (
        <AmountField
          label="Quantité en stock"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="0"
          suffix={unitLabel(unit)}
          hint="Le stock initial est tracé mais ne touche pas la caisse."
        />
      )}

      <AmountField
        label="Prix d’achat unitaire"
        value={price}
        onChangeText={setPrice}
        placeholder="0"
        suffix={`${currency.symbol}/${unitLabel(unit)}`}
      />

      <AmountField
        label="Seuil d’alerte"
        value={threshold}
        onChangeText={setThreshold}
        placeholder="0"
        suffix={unitLabel(unit)}
        hint="En dessous de ce seuil, le produit remonte sur le tableau de bord."
      />
    </Sheet>
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
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  summaryValue: {
    ...typography.h3,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 1,
  },
  summarySeparator: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  filters: {
    marginTop: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textOnPrimary,
  },
  actionTextSecondary: {
    color: colors.primary,
  },
  blockLabel: {
    ...typography.bodyStrong,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  spaced: {
    marginBottom: spacing.lg,
  },
  sheetSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  sheetLinkDanger: {
    color: colors.danger,
  },
});
