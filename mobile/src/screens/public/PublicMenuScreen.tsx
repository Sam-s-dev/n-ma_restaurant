import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Chips } from '../../components/workspace/Chips';
import { Field } from '../../components/workspace/Field';
import { ErrorState, LoadingState } from '../../components/workspace/ScreenState';
import { Sheet } from '../../components/workspace/Sheet';
import { Stepper } from '../../components/workspace/Stepper';
import { API_URL, ApiError, THUMB } from '../../api/client';
import { fetchPublicMenu, placeOrder } from '../../api/public';
import type { PublicDish, PublicMenu } from '../../api/public';
import type { OrderPayment } from '../../api/workspace/orders';
import { formatMoney } from '../../utils/money';
import type { Currency } from '../../utils/money';
import { readLocal, writeLocal } from '../../utils/publicRoute';
import { colors } from '../../theme/colors';
import { fontFamily, typography } from '../../theme/typography';
import { maxContentWidth, radius, shadows, spacing } from '../../theme/layout';

const CUSTOMER_KEY = 'nma.customer';

interface PublicMenuScreenProps {
  slug: string;
  onOrdered: (trackingCode: string) => void;
}

const photoOf = (dish: PublicDish) => (dish.photoUrl ? `${API_URL}${dish.photoUrl}?w=${THUMB.medium}` : null);

/**
 * La carte d'un restaurant, telle que ses clients la voient.
 *
 * Aucun compte : on choisit ses plats, on donne son nom, son téléphone et
 * un point de repère, et le restaurant rappelle pour confirmer.
 */
export function PublicMenuScreen({ slug, onOrdered }: PublicMenuScreenProps) {
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchPublicMenu(slug);
      setMenu(next);
      if (typeof document !== 'undefined') document.title = `${next.restaurant.name} · Commander`;
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 404
          ? 'Ce restaurant n’existe pas ou ne prend pas de commandes en ligne.'
          : cause instanceof ApiError
            ? cause.message
            : 'Chargement impossible.',
      );
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency: Currency = useMemo(
    () => ({ symbol: menu?.restaurant.currencySymbol ?? 'FG', decimals: menu?.restaurant.currencyDecimals ?? 0 }),
    [menu],
  );
  const money = (value: number) => formatMoney(value, currency);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!menu) return <LoadingState label="Chargement de la carte…" />;

  const { restaurant, ordering } = menu;
  const dishes = menu.dishes.filter((dish) => category === 'all' || dish.categoryId === category);
  const cartLines = menu.dishes
    .filter((dish) => (cart[dish.id] ?? 0) > 0)
    .map((dish) => ({ dish, quantity: cart[dish.id]! }));
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.quantity * line.dish.price, 0);

  const setQuantity = (dishId: string, quantity: number) =>
    setCart((current) => ({ ...current, [dishId]: quantity }));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {restaurant.logoUrl ? (
            <Image source={{ uri: `${API_URL}${restaurant.logoUrl}?w=${THUMB.small}` }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Icon name="bag" size={24} color={colors.primary} />
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.name}>{restaurant.name}</Text>
            {Boolean(restaurant.address) && <Text style={styles.meta}>{restaurant.address}</Text>}
            <View style={[styles.status, ordering.open ? styles.statusOpen : styles.statusClosed]}>
              <View style={[styles.statusDot, { backgroundColor: ordering.open ? colors.success : colors.textTertiary }]} />
              <Text style={[styles.statusText, { color: ordering.open ? colors.success : colors.textSecondary }]}>
                {ordering.open
                  ? `Commandes ouvertes${ordering.closesAt ? ` jusqu’à ${ordering.closesAt}` : ''}`
                  : ordering.closedReason === 'hours'
                    ? `Fermé · commandes de ${ordering.opensAt} à ${ordering.closesAt}`
                    : 'Commandes en ligne fermées'}
              </Text>
            </View>
          </View>
        </View>

        {Boolean(restaurant.message) && (
          <View style={styles.message}>
            <Text style={styles.messageText}>{restaurant.message}</Text>
          </View>
        )}

        {Boolean(restaurant.phone) && (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${restaurant.phone}`)}
            style={styles.call}
            accessibilityRole="link"
          >
            <Icon name="phone" size={15} color={colors.primary} />
            <Text style={styles.callText}>{restaurant.phone}</Text>
          </Pressable>
        )}

        {menu.categories.length > 1 && (
          <View style={styles.filters}>
            <Chips
              options={[
                { value: 'all', label: 'Tout' },
                ...menu.categories.map((item) => ({ value: item.id, label: item.name })),
              ]}
              value={category}
              onChange={setCategory}
            />
          </View>
        )}

        {dishes.length === 0 ? (
          <Text style={styles.empty}>Aucun plat proposé pour le moment.</Text>
        ) : (
          dishes.map((dish) => {
            const quantity = cart[dish.id] ?? 0;
            const photo = photoOf(dish);
            return (
              <View key={dish.id} style={[styles.dish, dish.soldOut && styles.dishOff]}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.dishPhoto} />
                ) : (
                  <View style={[styles.dishPhoto, styles.dishPhotoFallback]}>
                    <Icon name="menu-book" size={22} color={colors.textTertiary} />
                  </View>
                )}
                <View style={styles.dishBody}>
                  <Text style={styles.dishName}>{dish.name}</Text>
                  {Boolean(dish.description) && (
                    <Text style={styles.dishDescription} numberOfLines={2}>
                      {dish.description}
                    </Text>
                  )}
                  <View style={styles.dishFooter}>
                    <Text style={styles.dishPrice}>{money(dish.price)}</Text>
                    {dish.soldOut ? (
                      <Text style={styles.soldOut}>Épuisé</Text>
                    ) : !ordering.open ? null : quantity === 0 ? (
                      <Pressable
                        onPress={() => setQuantity(dish.id, 1)}
                        style={styles.add}
                        accessibilityRole="button"
                        accessibilityLabel={`Ajouter ${dish.name}`}
                      >
                        <Icon name="plus" size={14} color={colors.textOnPrimary} strokeWidth={2.6} />
                        <Text style={styles.addText}>Ajouter</Text>
                      </Pressable>
                    ) : (
                      <Stepper value={quantity} onChange={(value) => setQuantity(dish.id, value)} max={99} compact />
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.footer}>Commande en ligne propulsée par N’ma Restaurant</Text>
      </ScrollView>

      {cartCount > 0 && ordering.open && (
        <View style={[styles.cartBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Pressable
            onPress={() => setCheckoutOpen(true)}
            style={({ pressed }) => [styles.cartButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartLabel}>Commander</Text>
            <Text style={styles.cartTotal}>{money(cartTotal)}</Text>
          </Pressable>
        </View>
      )}

      <CheckoutSheet
        visible={checkoutOpen}
        menu={menu}
        lines={cartLines}
        itemsTotal={cartTotal}
        money={money}
        onClose={() => setCheckoutOpen(false)}
        onRefreshMenu={() => void load()}
        onOrdered={(code) => {
          setCheckoutOpen(false);
          setCart({});
          onOrdered(code);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Validation de la commande
// ---------------------------------------------------------------------------

interface CheckoutSheetProps {
  visible: boolean;
  menu: PublicMenu;
  lines: Array<{ dish: PublicDish; quantity: number }>;
  itemsTotal: number;
  money: (value: number) => string;
  onClose: () => void;
  onRefreshMenu: () => void;
  onOrdered: (trackingCode: string) => void;
}

function CheckoutSheet({ visible, menu, lines, itemsTotal, money, onClose, onRefreshMenu, onOrdered }: CheckoutSheetProps) {
  const { ordering, zones } = menu;
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [zoneId, setZoneId] = useState('');
  const [landmark, setLandmark] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState<OrderPayment>('cash');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode(ordering.delivery ? 'delivery' : 'pickup');
    setErrors({});
    setError(null);
    // Le client qui revient n'a pas à ressaisir son nom et son numéro.
    try {
      const saved = JSON.parse(readLocal(CUSTOMER_KEY) ?? '{}') as { name?: string; phone?: string; landmark?: string; zoneId?: string };
      if (saved.name) setName((current) => current || saved.name!);
      if (saved.phone) setPhone((current) => current || saved.phone!);
      if (saved.landmark) setLandmark((current) => current || saved.landmark!);
      if (saved.zoneId && zones.some((zone) => zone.id === saved.zoneId)) {
        setZoneId((current) => current || saved.zoneId!);
      }
    } catch {
      // Préférences illisibles : on repart de zéro.
    }
  }, [visible, ordering.delivery, zones]);

  const zone = zones.find((item) => item.id === zoneId);
  const deliveryFee = mode === 'delivery' ? (zone?.fee ?? 0) : 0;

  async function submit() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Indiquez votre nom.';
    if (phone.replace(/\D/g, '').length < 8) next.phone = 'Indiquez un numéro où le restaurant peut vous appeler.';
    if (mode === 'delivery' && !zone) next.zone = 'Choisissez votre quartier.';
    if (mode === 'delivery' && landmark.trim().length < 3) {
      next.landmark = 'Un repère aide le livreur à vous trouver.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSending(true);
    setError(null);
    try {
      const order = await placeOrder(menu.restaurant.slug, {
        customerName: name.trim(),
        customerPhone: phone.trim(),
        mode,
        zoneId: mode === 'delivery' ? zoneId : null,
        landmark: mode === 'delivery' ? landmark.trim() : null,
        note: note.trim() || null,
        paymentMethod: payment,
        items: lines.map((line) => ({ dishId: line.dish.id, quantity: line.quantity })),
      });
      writeLocal(
        CUSTOMER_KEY,
        JSON.stringify({ name: name.trim(), phone: phone.trim(), landmark: landmark.trim(), zoneId }),
      );
      onOrdered(order.trackingCode);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Envoi impossible. Vérifiez votre connexion.');
      // Un plat épuisé entre-temps : la carte à jour le montre.
      if (cause instanceof ApiError && cause.status === 422) onRefreshMenu();
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Votre commande"
      subtitle={menu.restaurant.name}
      error={error}
      onClose={onClose}
      actions={<Button label={`Commander · ${money(itemsTotal + deliveryFee)}`} onPress={submit} loading={sending} />}
    >
      {lines.map((line) => (
        <View key={line.dish.id} style={styles.line}>
          <Text style={styles.lineName}>
            {line.quantity} × {line.dish.name}
          </Text>
          <Text style={styles.lineValue}>{money(line.quantity * line.dish.price)}</Text>
        </View>
      ))}

      {ordering.delivery && ordering.pickup && (
        <View style={styles.block}>
          <Chips
            options={[
              { value: 'delivery', label: 'Livraison' },
              { value: 'pickup', label: 'À emporter' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
      )}

      {mode === 'delivery' ? (
        <>
          <Text style={styles.blockLabel}>Quartier de livraison</Text>
          <View style={styles.block}>
            <Chips
              options={zones.map((item) => ({ value: item.id, label: `${item.name} · ${money(item.fee)}` }))}
              value={zoneId}
              onChange={(value) => {
                setZoneId(value);
                setErrors((current) => ({ ...current, zone: '' }));
              }}
            />
            {Boolean(errors.zone) && <Text style={styles.fieldError}>{errors.zone}</Text>}
          </View>
          <Field
            label="Point de repère"
            value={landmark}
            onChangeText={setLandmark}
            placeholder="Derrière la station Total de Kipé"
            error={errors.landmark || undefined}
            multiline
          />
        </>
      ) : (
        <Banner tone="info" message="Vous viendrez chercher votre commande au restaurant, et vous paierez sur place." />
      )}

      <Field
        label="Votre nom"
        value={name}
        onChangeText={setName}
        placeholder="Mariama Diallo"
        autoComplete="name"
        error={errors.name || undefined}
      />
      <Field
        label="Votre téléphone"
        value={phone}
        onChangeText={setPhone}
        placeholder="622 00 00 00"
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel"
        error={errors.phone || undefined}
        hint="Le restaurant vous appelle pour confirmer la commande."
      />

      <Text style={styles.blockLabel}>Paiement {mode === 'delivery' ? 'à la livraison' : 'sur place'}</Text>
      <View style={styles.block}>
        <Chips
          options={[
            { value: 'cash', label: 'Espèces' },
            { value: 'mobile_money', label: 'Mobile Money' },
          ]}
          value={payment}
          onChange={setPayment}
        />
      </View>

      <Field
        label="Remarque (facultatif)"
        value={note}
        onChangeText={setNote}
        placeholder="Sans piment, s’il vous plaît"
        multiline
      />

      <View style={styles.totals}>
        <View style={styles.line}>
          <Text style={styles.totalLabel}>Plats</Text>
          <Text style={styles.lineValue}>{money(itemsTotal)}</Text>
        </View>
        {mode === 'delivery' && (
          <View style={styles.line}>
            <Text style={styles.totalLabel}>Livraison{zone ? ` · ${zone.name}` : ''}</Text>
            <Text style={styles.lineValue}>{zone ? money(zone.fee) : '—'}</Text>
          </View>
        )}
        <View style={styles.line}>
          <Text style={styles.grandLabel}>Total à payer</Text>
          <Text style={styles.grandValue}>{money(itemsTotal + deliveryFee)}</Text>
        </View>
      </View>
    </Sheet>
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
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headerText: {
    flex: 1,
  },
  name: {
    ...typography.h2,
  },
  meta: {
    ...typography.small,
    color: colors.textTertiary,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  statusOpen: {
    backgroundColor: colors.successSoft,
  },
  statusClosed: {
    backgroundColor: colors.backgroundAlt,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  message: {
    backgroundColor: colors.pastelAmber,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  messageText: {
    ...typography.small,
    color: colors.textPrimary,
  },
  call: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  callText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },
  filters: {
    marginBottom: spacing.lg,
  },
  empty: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.huge,
  },
  dish: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.soft,
  },
  dishOff: {
    opacity: 0.55,
  },
  dishPhoto: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundAlt,
  },
  dishPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  dishName: {
    ...typography.bodyStrong,
    fontSize: 15,
    lineHeight: 21,
  },
  dishDescription: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
    marginTop: 2,
  },
  dishFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dishPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  soldOut: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textTertiary,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  addText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnPrimary,
  },
  footer: {
    ...typography.small,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  cartBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  cartButton: {
    width: '100%',
    maxWidth: maxContentWidth - spacing.lg * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.primaryButton,
  },
  pressed: {
    opacity: 0.85,
  },
  cartCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCountText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.primary,
  },
  cartLabel: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textOnPrimary,
  },
  cartTotal: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textOnPrimary,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: 5,
  },
  lineName: {
    ...typography.body,
    flex: 1,
  },
  lineValue: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  block: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  blockLabel: {
    ...typography.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  fieldError: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  totals: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  totalLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  grandLabel: {
    ...typography.bodyStrong,
  },
  grandValue: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.primary,
  },
});
