import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Chips } from '../../components/workspace/Chips';
import { ConfirmSheet } from '../../components/workspace/ConfirmSheet';
import { AmountField, Field } from '../../components/workspace/Field';
import { EmptyState, ListRow, RowDivider, SectionHeader } from '../../components/workspace/ListRow';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { SearchField } from '../../components/workspace/SearchField';
import { PhotoField } from '../../components/workspace/PhotoField';
import { Sheet } from '../../components/workspace/Sheet';
import { ToggleRow } from '../../components/workspace/ToggleRow';
import { ApiError, mediaUrl, THUMB } from '../../api/client';
import { useResource } from '../../api/cache';
import {
  createCategory,
  createDish,
  deleteCategory,
  deleteDish,
  listCategories,
  listDishes,
  renameCategory,
  setDishAvailability,
  updateDish,
} from '../../api/workspace/menu';
import type { Category, Dish } from '../../api/workspace/menu';
import { parseAmount } from '../../utils/money';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { radius, screenPadding, spacing } from '../../theme/layout';
import { useWorkspace } from './WorkspaceContext';

/**
 * §5 — Menu : catégories et plats.
 *
 * La disponibilité se règle à la main depuis la liste : en cuisine, un plat
 * tombe en rupture sans prévenir, et il faut pouvoir le retirer de la vente
 * en un geste sans ouvrir de formulaire.
 */
export function MenuScreen() {
  const { money, notify, can } = useWorkspace();
  // Le caissier consulte la carte et signale une rupture, sans toucher aux
  // plats ni aux prix.
  const canManage = can('menu.manage');

  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  /** Copie locale, pour la bascule optimiste « disponible / rupture ». */
  const [overrides, setOverrides] = useState<Record<string, Dish>>({});

  const [dishSheet, setDishSheet] = useState<{ open: boolean; dish: Dish | null }>({
    open: false,
    dish: null,
  });
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Dish | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const menu = useResource<{ categories: Category[]; dishes: Dish[] }>('menu:list', async () => {
    const [categories, dishes] = await Promise.all([listCategories(), listDishes()]);
    return { categories, dishes };
  });

  const load = useCallback(async () => {
    setOverrides({});
    await menu.refresh();
  }, [menu]);

  const categories = menu.data?.categories ?? [];
  const dishes = useMemo(
    () => (menu.data?.dishes ?? []).map((dish) => overrides[dish.id] ?? dish),
    [menu.data, overrides],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return dishes.filter((dish) => {
      const matchesCategory = category === 'all' || dish.categoryId === category;
      const matchesSearch = term === '' || dish.name.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [dishes, category, search]);

  async function toggleAvailability(dish: Dish) {
    // Mise à jour optimiste : la bascule doit être instantanée en service.
    // Elle est tenue à part de la liste chargée, qui reste la référence.
    setOverrides((current) => ({
      ...current,
      [dish.id]: { ...dish, isAvailable: !dish.isAvailable },
    }));

    try {
      const updated = await setDishAvailability(dish.id, !dish.isAvailable);
      setOverrides((current) => ({ ...current, [dish.id]: updated }));
    } catch (cause) {
      setOverrides((current) => ({ ...current, [dish.id]: dish }));
      notify(cause instanceof ApiError ? cause.message : 'Changement impossible.', 'danger');
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDish(toDelete.id);
      setToDelete(null);
      notify('Plat retiré du menu');
      await load();
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? cause.message : 'Suppression impossible.');
    } finally {
      setDeleting(false);
    }
  }

  if (menu.loading) return <LoadingState label="Chargement du menu…" />;
  if (menu.error) return <ErrorState message={menu.error} onRetry={() => void load()} />;

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
        <SearchField value={search} onChangeText={setSearch} placeholder="Rechercher un plat…" />

        <View style={styles.filters}>
          <Chips
            bleed={screenPadding}
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'Tout', badge: dishes.length },
              ...categories.map((item) => ({
                value: item.id,
                label: item.name,
                badge: item.dishesCount,
              })),
            ]}
          />
        </View>

        {canManage && (
          <View style={styles.actions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => setDishSheet({ open: true, dish: null })}
              accessibilityRole="button"
            >
              <Icon name="plus" size={16} color={colors.textOnPrimary} strokeWidth={2.5} />
              <Text style={styles.actionText}>Nouveau plat</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.actionSecondary]}
              onPress={() => setCategoriesOpen(true)}
              accessibilityRole="button"
            >
              <Icon name="grid" size={16} color={colors.primary} strokeWidth={2.2} />
              <Text style={[styles.actionText, styles.actionTextSecondary]}>Catégories</Text>
            </Pressable>
          </View>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon="menu-book"
            title={dishes.length === 0 ? 'Aucun plat' : 'Aucun résultat'}
            message={
              dishes.length === 0
                ? 'Ajoutez vos plats et leurs prix : ils seront proposés à la vente et suivis dans vos statistiques.'
                : 'Aucun plat ne correspond à votre recherche.'
            }
            action={
              dishes.length === 0 && canManage ? (
                <Button
                  label="Ajouter un plat"
                  onPress={() => setDishSheet({ open: true, dish: null })}
                />
              ) : undefined
            }
          />
        ) : (
          <Card reveal={0}>
            {visible.map((dish, index) => (
              <View key={dish.id}>
                {index > 0 && <RowDivider />}
                <View style={styles.dishRow}>
                  <Pressable
                    style={styles.dishMain}
                    onPress={canManage ? () => setDishSheet({ open: true, dish }) : undefined}
                    disabled={!canManage}
                    accessibilityRole={canManage ? 'button' : undefined}
                  >
                    {dish.photoMediaId ? (
                      <Image
                        source={{ uri: mediaUrl(dish.photoMediaId, THUMB.small) as string }}
                        style={[styles.dishPhoto, !dish.isAvailable && styles.dishPhotoOff]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.dishBullet,
                          {
                            backgroundColor: dish.isAvailable
                              ? colors.pastelGreen
                              : colors.backgroundAlt,
                          },
                        ]}
                      >
                        <Icon
                          name="menu-book"
                          size={17}
                          color={dish.isAvailable ? colors.iconGreen : colors.textTertiary}
                        />
                      </View>
                    )}

                    <View style={styles.dishTexts}>
                      <Text style={styles.dishName} numberOfLines={1}>
                        {dish.name}
                      </Text>
                      <Text style={styles.dishMeta} numberOfLines={1}>
                        {dish.categoryName ?? 'Sans catégorie'} · {money(dish.price)}
                        {dish.availableQuantity !== null
                          ? ` · ${dish.availableQuantity} portion(s)`
                          : ''}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => void toggleAvailability(dish)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: dish.isAvailable }}
                    accessibilityLabel={`${dish.name} : ${dish.isAvailable ? 'disponible' : 'en rupture'}`}
                    style={[styles.toggle, dish.isAvailable && styles.toggleOn]}
                  >
                    <Text style={[styles.toggleText, dish.isAvailable && styles.toggleTextOn]}>
                      {dish.isAvailable ? 'Dispo' : 'Rupture'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <DishSheet
        visible={dishSheet.open}
        dish={dishSheet.dish}
        categories={categories}
        onClose={() => setDishSheet({ open: false, dish: null })}
        onDelete={(dish) => {
          setDishSheet({ open: false, dish: null });
          setDeleteError(null);
          setToDelete(dish);
        }}
        onDone={(message) => {
          setDishSheet({ open: false, dish: null });
          notify(message);
          void load();
        }}
      />

      <CategoriesSheet
        visible={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChanged={() => void load()}
        notify={notify}
      />

      <ConfirmSheet
        visible={Boolean(toDelete)}
        title="Retirer du menu"
        message={`« ${toDelete?.name ?? ''} » ne sera plus proposé à la vente. S’il a déjà été vendu, il est simplement archivé pour que vos anciens tickets restent lisibles.`}
        confirmLabel="Retirer le plat"
        loading={deleting}
        error={deleteError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  );
}

interface DishSheetProps {
  visible: boolean;
  dish: Dish | null;
  categories: Category[];
  onClose: () => void;
  onDelete: (dish: Dish) => void;
  onDone: (message: string) => void;
}

function DishSheet({ visible, dish, categories, onClose, onDelete, onDone }: DishSheetProps) {
  const { currency } = useWorkspace();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('none');
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(dish?.name ?? '');
    setPrice(dish ? String(dish.price) : '');
    setDescription(dish?.description ?? '');
    setCategoryId(dish?.categoryId ?? 'none');
    setPhotoMediaId(dish?.photoMediaId ?? null);
    setQuantity(dish?.availableQuantity !== null && dish ? String(dish.availableQuantity) : '');
    setIsOnline(dish?.isOnline ?? true);
    setErrors({});
    setError(null);
  }, [visible, dish]);

  async function submit() {
    const value = parseAmount(price);
    const next: { name?: string; price?: string } = {};
    if (name.trim().length < 1) next.name = 'Donnez un nom au plat.';
    if (value === null || value < 0) next.price = 'Saisissez un prix valide.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      // Champ laissé vide = quantité non suivie : le plat reste vendable
      // sans limite, ce qui convient aux plats préparés à la commande.
      const parsedQuantity = quantity.trim() === '' ? null : Math.max(0, Math.trunc(parseAmount(quantity) ?? 0));

      const payload = {
        name: name.trim(),
        price: value as number,
        categoryId: categoryId === 'none' ? null : categoryId,
        description: description.trim() === '' ? null : description.trim(),
        photoMediaId,
        availableQuantity: parsedQuantity,
        isOnline,
      };

      if (dish) {
        await updateDish(dish.id, payload);
        onDone('Plat mis à jour');
      } else {
        await createDish(payload);
        onDone('Plat ajouté au menu');
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
      title={dish ? 'Modifier le plat' : 'Nouveau plat'}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button label="Enregistrer" onPress={submit} loading={saving} />
          {dish && (
            <Button label="Retirer du menu" onPress={() => onDelete(dish)} variant="ghost" />
          )}
        </>
      }
    >
      <PhotoField
        label="Photo du plat"
        hint="Elle apparaîtra sur la carte et sur l’écran de vente."
        mediaId={photoMediaId}
        onChange={setPhotoMediaId}
      />

      <Field
        label="Nom du plat"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder="Poulet braisé"
        error={errors.name}
      />

      <AmountField
        label="Prix de vente"
        value={price}
        onChangeText={(value) => {
          setPrice(value);
          if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
        }}
        placeholder="0"
        suffix={currency.symbol}
        error={errors.price}
      />

      <AmountField
        label="Portions préparées"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="Illimité"
        suffix="portion(s)"
        hint={
          dish && dish.availableQuantity === 0
            ? 'Ce plat est épuisé. Saisissez la quantité préparée pour le remettre en vente.'
            : 'Chaque vente en retire une. À zéro, le plat sort de la carte. Laissez vide pour ne pas compter.'
        }
      />

      <ToggleRow
        label="Proposé en ligne"
        hint="Visible sur votre mini-site de commande. Désactivez-le pour un plat servi au comptoir seulement."
        value={isOnline}
        onChange={setIsOnline}
      />

      <Text style={styles.blockLabel}>Catégorie</Text>
      <View style={styles.categoryPicker}>
        <Chips
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: 'none', label: 'Sans catégorie' },
            ...categories.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
      </View>

      <Field
        label="Description (facultatif)"
        value={description}
        onChangeText={setDescription}
        placeholder="Accompagné d’attiéké"
        multiline
      />
    </Sheet>
  );
}

interface CategoriesSheetProps {
  visible: boolean;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
  notify: (message: string, tone?: 'success' | 'danger') => void;
}

function CategoriesSheet({
  visible,
  categories,
  onClose,
  onChanged,
  notify,
}: CategoriesSheetProps) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setEditing(null);
      setError(null);
    }
  }, [visible]);

  async function add() {
    if (name.trim().length < 1) return;
    setSaving(true);
    setError(null);
    try {
      await createCategory(name.trim(), categories.length);
      setName('');
      onChanged();
      notify('Catégorie ajoutée');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Ajout impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function rename(id: string) {
    if (editName.trim().length < 1) return;
    setError(null);
    try {
      await renameCategory(id, editName.trim());
      setEditing(null);
      onChanged();
      notify('Catégorie renommée');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Modification impossible.');
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteCategory(id);
      onChanged();
      notify('Catégorie supprimée');
    } catch (cause) {
      // Le backend refuse tant que la catégorie contient des plats : ce
      // message est utile, on l'affiche tel quel.
      setError(cause instanceof ApiError ? cause.message : 'Suppression impossible.');
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Catégories"
      subtitle="Organisez la carte pour retrouver un plat plus vite"
      error={error}
      onClose={onClose}
      actions={<Button label="Terminé" onPress={onClose} variant="secondary" />}
    >
      <View style={styles.addCategory}>
        <View style={styles.addCategoryField}>
          <Field
            label="Nouvelle catégorie"
            value={name}
            onChangeText={setName}
            placeholder="Boissons"
            onSubmitEditing={add}
            returnKeyType="done"
          />
        </View>
        <Pressable
          onPress={add}
          disabled={saving || name.trim().length === 0}
          style={[styles.addButton, name.trim().length === 0 && styles.addButtonOff]}
          accessibilityRole="button"
          accessibilityLabel="Ajouter la catégorie"
        >
          <Icon name="plus" size={18} color={colors.textOnPrimary} strokeWidth={2.6} />
        </Pressable>
      </View>

      {categories.length === 0 ? (
        <Text style={styles.emptyCategories}>
          Aucune catégorie pour l’instant. Les plats restent utilisables sans.
        </Text>
      ) : (
        <>
          <SectionHeader title="Existantes" caption={`${categories.length} catégorie(s)`} />
          {categories.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <RowDivider />}
              {editing === item.id ? (
                <View style={styles.editRow}>
                  <View style={styles.editField}>
                    <Field
                      label="Nom"
                      value={editName}
                      onChangeText={setEditName}
                      autoFocus
                      onSubmitEditing={() => void rename(item.id)}
                    />
                  </View>
                  <Pressable
                    onPress={() => void rename(item.id)}
                    style={styles.iconButton}
                    accessibilityLabel="Valider"
                    accessibilityRole="button"
                  >
                    <Icon name="check" size={17} color={colors.success} strokeWidth={2.5} />
                  </Pressable>
                </View>
              ) : (
                <ListRow
                  title={item.name}
                  subtitle={`${item.dishesCount} plat(s)`}
                  badge={
                    <View style={styles.rowActions}>
                      <Pressable
                        onPress={() => {
                          setEditing(item.id);
                          setEditName(item.name);
                        }}
                        hitSlop={8}
                        accessibilityLabel={`Renommer ${item.name}`}
                        accessibilityRole="button"
                      >
                        <Icon name="edit" size={16} color={colors.textTertiary} />
                      </Pressable>
                      <Pressable
                        onPress={() => void remove(item.id)}
                        hitSlop={8}
                        accessibilityLabel={`Supprimer ${item.name}`}
                        accessibilityRole="button"
                      >
                        <Icon name="trash" size={16} color={colors.danger} />
                      </Pressable>
                    </View>
                  }
                />
              )}
            </View>
          ))}
        </>
      )}
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
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  actionTextSecondary: {
    color: colors.primary,
  },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  dishMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dishBullet: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishPhoto: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
  },
  dishPhotoOff: {
    opacity: 0.45,
  },
  dishTexts: {
    flex: 1,
  },
  dishName: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
  },
  dishMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  toggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
  },
  toggleOn: {
    backgroundColor: colors.successSoft,
  },
  toggleText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  toggleTextOn: {
    color: colors.success,
  },
  blockLabel: {
    ...typography.bodyStrong,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  categoryPicker: {
    marginBottom: spacing.xl,
  },
  addCategory: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  addCategoryField: {
    flex: 1,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  addButtonOff: {
    opacity: 0.4,
  },
  emptyCategories: {
    ...typography.small,
    color: colors.textTertiary,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  editField: {
    flex: 1,
  },
  iconButton: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
});
