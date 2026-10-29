import { randomBytes } from 'node:crypto';
import { AppError, conflict, notFound, unprocessable } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { formatAmount, round2 } from '../../utils/money';
import { notify } from '../notifications/notifications.service';
import { cancelByCustomer, loadOrder, loadOrderByTracking, type OnlineOrder } from '../orders/orders.service';
import type {
  PlaceOrderInput,
  UpdateOnlineSettingsInput,
  UpdateZoneInput,
  ZoneInput,
} from './online.schemas';

// ---------------------------------------------------------------------------
// Réglages (espace restaurant)
// ---------------------------------------------------------------------------

export interface OnlineSettings {
  slug: string | null;
  /** Proposé tant que le gérant n'a pas choisi : tiré du nom du restaurant. */
  suggestedSlug: string;
  allowed: boolean;
  enabled: boolean;
  delivery: boolean;
  pickup: boolean;
  opensAt: string | null;
  closesAt: string | null;
  message: string | null;
}

interface SettingsRow {
  name: string;
  slug: string | null;
  online_allowed: boolean;
  online_enabled: boolean;
  online_delivery: boolean;
  online_pickup: boolean;
  online_opens_at: string | null;
  online_closes_at: string | null;
  online_message: string | null;
}

/** « Chez Fatou & Fils » → « chez-fatou-fils ». */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `resto-${slug || 'en-ligne'}`;
}

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : null);

const toSettings = (row: SettingsRow): OnlineSettings => ({
  slug: row.slug,
  suggestedSlug: row.slug ?? slugify(row.name),
  allowed: row.online_allowed,
  enabled: row.online_enabled,
  delivery: row.online_delivery,
  pickup: row.online_pickup,
  opensAt: hhmm(row.online_opens_at),
  closesAt: hhmm(row.online_closes_at),
  message: row.online_message,
});

const SETTINGS_COLUMNS = `name, slug, online_allowed, online_enabled, online_delivery, online_pickup,
  online_opens_at, online_closes_at, online_message`;

export async function getSettings(restaurantId: string): Promise<OnlineSettings> {
  const row = await queryOne<SettingsRow>(
    `SELECT ${SETTINGS_COLUMNS} FROM restaurants WHERE id = $1`,
    [restaurantId],
  );
  if (!row) throw notFound('Restaurant');
  return toSettings(row);
}

export async function updateSettings(
  restaurantId: string,
  input: UpdateOnlineSettingsInput,
): Promise<OnlineSettings> {
  const current = await getSettings(restaurantId);

  if (input.enabled) {
    if (!current.allowed) {
      throw conflict('La commande en ligne n’est pas activée pour votre restaurant. Contactez l’administrateur.');
    }
    if (!(input.slug ?? current.slug)) {
      throw unprocessable('Choisissez d’abord l’adresse de votre mini-site.');
    }
  }
  const delivery = input.delivery ?? current.delivery;
  const pickup = input.pickup ?? current.pickup;
  if (!delivery && !pickup) {
    throw unprocessable('Proposez au moins la livraison ou le retrait sur place.');
  }

  const { setClause, values, nextIndex } = buildUpdate(input, {
    slug: 'slug',
    enabled: 'online_enabled',
    delivery: 'online_delivery',
    pickup: 'online_pickup',
    opensAt: 'online_opens_at',
    closesAt: 'online_closes_at',
    message: 'online_message',
  });

  try {
    await query(`UPDATE restaurants SET ${setClause} WHERE id = $${nextIndex}`, [
      ...values,
      restaurantId,
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw conflict('Cette adresse est déjà prise par un autre restaurant. Essayez-en une autre.');
    }
    throw error;
  }
  return getSettings(restaurantId);
}

// ---------------------------------------------------------------------------
// Zones de livraison
// ---------------------------------------------------------------------------

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

const ZONE_SELECT = 'SELECT id, name, fee, is_active AS "isActive" FROM delivery_zones';

export async function listZones(restaurantId: string): Promise<DeliveryZone[]> {
  return query<DeliveryZone>(`${ZONE_SELECT} WHERE restaurant_id = $1 ORDER BY lower(name)`, [
    restaurantId,
  ]);
}

function zoneConflict(error: unknown): never {
  if ((error as { code?: string }).code === '23505') {
    throw conflict('Une zone porte déjà ce nom.');
  }
  throw error;
}

export async function createZone(restaurantId: string, input: ZoneInput): Promise<DeliveryZone> {
  const row = await queryOne<DeliveryZone>(
    `INSERT INTO delivery_zones (restaurant_id, name, fee, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, fee, is_active AS "isActive"`,
    [restaurantId, input.name, round2(input.fee), input.isActive],
  ).catch(zoneConflict);
  if (!row) throw new Error('Création de la zone impossible.');
  return row;
}

export async function updateZone(
  restaurantId: string,
  id: string,
  input: UpdateZoneInput,
): Promise<DeliveryZone> {
  const { setClause, values, nextIndex } = buildUpdate(input, {
    name: 'name',
    fee: 'fee',
    isActive: 'is_active',
  });
  const row = await queryOne<DeliveryZone>(
    `UPDATE delivery_zones SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1}
      RETURNING id, name, fee, is_active AS "isActive"`,
    [...values, id, restaurantId],
  ).catch(zoneConflict);
  if (!row) throw notFound('Zone');
  return row;
}

/** Les commandes passées gardent le nom de la zone : elles n'en dépendent pas. */
export async function deleteZone(restaurantId: string, id: string): Promise<void> {
  const row = await queryOne('DELETE FROM delivery_zones WHERE id = $1 AND restaurant_id = $2 RETURNING id', [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Zone');
}

// ---------------------------------------------------------------------------
// Mini-site public
// ---------------------------------------------------------------------------

interface PublicRestaurantRow extends SettingsRow {
  id: string;
  address: string | null;
  phone: string | null;
  logo_media_id: string | null;
  currency_code: string;
  currency_symbol: string;
  currency_decimals: number;
  is_open_now: boolean;
}

/**
 * Un restaurant n'est visible qu'actif, autorisé par l'éditeur et doté
 * d'une adresse. Dans tous les autres cas, la page répond « introuvable ».
 */
async function findPublicRestaurant(slug: string): Promise<PublicRestaurantRow> {
  const row = await queryOne<PublicRestaurantRow>(
    `SELECT id, address, phone, logo_media_id, currency_code, currency_symbol, currency_decimals,
            ${SETTINGS_COLUMNS},
            CASE
              WHEN online_opens_at IS NULL OR online_closes_at IS NULL THEN true
              WHEN online_opens_at <= online_closes_at
                THEN (now() AT TIME ZONE 'Africa/Conakry')::time
                     BETWEEN online_opens_at AND online_closes_at
              -- Ouvert après minuit : 18:00 → 02:00.
              ELSE (now() AT TIME ZONE 'Africa/Conakry')::time >= online_opens_at
                OR (now() AT TIME ZONE 'Africa/Conakry')::time <= online_closes_at
            END AS is_open_now
       FROM restaurants
      WHERE slug = $1 AND status = 'active' AND online_allowed`,
    [slug],
  );
  if (!row) throw notFound('Restaurant');
  return row;
}

function orderingState(row: PublicRestaurantRow, hasZones: boolean) {
  const closedReason = !row.online_enabled ? 'disabled' : !row.is_open_now ? 'hours' : null;
  return {
    open: closedReason === null,
    closedReason,
    opensAt: hhmm(row.online_opens_at),
    closesAt: hhmm(row.online_closes_at),
    // La livraison n'est proposée que si au moins une zone a un prix.
    delivery: row.online_delivery && hasZones,
    pickup: row.online_pickup,
  };
}

export async function publicMenu(slug: string) {
  const restaurant = await findPublicRestaurant(slug);

  const [zones, categories, dishes] = await Promise.all([
    query<{ id: string; name: string; fee: number }>(
      `SELECT id, name, fee FROM delivery_zones
        WHERE restaurant_id = $1 AND is_active ORDER BY lower(name)`,
      [restaurant.id],
    ),
    query<{ id: string; name: string }>(
      `SELECT c.id, c.name FROM menu_categories c
        WHERE c.restaurant_id = $1
          AND EXISTS (SELECT 1 FROM dishes d
                       WHERE d.category_id = c.id AND d.is_online AND NOT d.is_archived)
        ORDER BY c.position, c.name`,
      [restaurant.id],
    ),
    query<{
      id: string;
      name: string;
      description: string | null;
      category_id: string | null;
      photo_media_id: string | null;
      price: number;
      sold_out: boolean;
    }>(
      `SELECT id, name, description, category_id, photo_media_id, price,
              (NOT is_available OR available_quantity = 0) AS sold_out
         FROM dishes
        WHERE restaurant_id = $1 AND is_online AND NOT is_archived
        ORDER BY sold_out, name`,
      [restaurant.id],
    ),
  ]);

  return {
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      address: restaurant.address,
      phone: restaurant.phone,
      logoUrl: restaurant.logo_media_id ? `/api/media/${restaurant.logo_media_id}` : null,
      message: restaurant.online_message,
      currencyCode: restaurant.currency_code,
      currencySymbol: restaurant.currency_symbol,
      currencyDecimals: restaurant.currency_decimals,
    },
    ordering: orderingState(restaurant, zones.length > 0),
    zones,
    categories,
    dishes: dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      description: dish.description,
      categoryId: dish.category_id,
      photoUrl: dish.photo_media_id ? `/api/media/${dish.photo_media_id}` : null,
      price: dish.price,
      soldOut: dish.sold_out,
    })),
  };
}

/** Commandes encore en attente pour un même numéro : au-delà, on soupçonne un abus. */
const MAX_PENDING_PER_PHONE = 3;

export async function placeOrder(slug: string, input: PlaceOrderInput) {
  const restaurant = await findPublicRestaurant(slug);
  const zoneCount = await queryOne<{ count: number }>(
    'SELECT count(*)::int AS count FROM delivery_zones WHERE restaurant_id = $1 AND is_active',
    [restaurant.id],
  );
  const ordering = orderingState(restaurant, (zoneCount?.count ?? 0) > 0);

  if (!ordering.open) {
    throw unprocessable(
      ordering.closedReason === 'hours'
        ? `Le restaurant prend les commandes de ${ordering.opensAt} à ${ordering.closesAt}.`
        : 'Le restaurant ne prend pas de commandes en ligne pour le moment.',
    );
  }
  if (input.mode === 'delivery' && !ordering.delivery) {
    throw unprocessable('Ce restaurant ne livre pas pour le moment : choisissez le retrait sur place.');
  }
  if (input.mode === 'pickup' && !ordering.pickup) {
    throw unprocessable('Ce restaurant ne propose que la livraison.');
  }

  const restaurantId = restaurant.id;

  const orderId = await withTransaction(async (tx) => {
    const pending = await tx.queryOne<{ count: number }>(
      `SELECT count(*)::int AS count FROM online_orders
        WHERE restaurant_id = $1 AND customer_phone = $2 AND status = 'pending'`,
      [restaurantId, input.customerPhone],
    );
    if ((pending?.count ?? 0) >= MAX_PENDING_PER_PHONE) {
      throw new AppError(
        429,
        'TOO_MANY_REQUESTS',
        'Vous avez déjà des commandes en attente. Patientez que le restaurant vous rappelle.',
      );
    }

    let zone: { id: string; name: string; fee: number } | null = null;
    if (input.mode === 'delivery') {
      zone = await tx.queryOne(
        `SELECT id, name, fee FROM delivery_zones
          WHERE id = $1 AND restaurant_id = $2 AND is_active`,
        [input.zoneId, restaurantId],
      );
      if (!zone) throw unprocessable('Ce quartier n’est plus desservi. Choisissez-en un autre.');
    }

    const dishIds = [...new Set(input.items.map((item) => item.dishId))];
    const dishes = await tx.query<{
      id: string;
      name: string;
      price: number;
      available: boolean;
      available_quantity: number | null;
    }>(
      `SELECT id, name, price, available_quantity,
              (is_available AND is_online AND NOT is_archived) AS available
         FROM dishes WHERE restaurant_id = $1 AND id = ANY($2::uuid[])`,
      [restaurantId, dishIds],
    );
    const byId = new Map(dishes.map((dish) => [dish.id, dish]));

    const requested = new Map<string, number>();
    for (const item of input.items) {
      requested.set(item.dishId, (requested.get(item.dishId) ?? 0) + item.quantity);
    }
    for (const [id, quantity] of requested) {
      const dish = byId.get(id);
      if (!dish || !dish.available) {
        throw unprocessable(
          dish ? `« ${dish.name} » n’est plus disponible.` : 'Un plat de votre panier n’est plus proposé.',
        );
      }
      if (dish.available_quantity !== null && quantity > dish.available_quantity) {
        throw unprocessable(
          dish.available_quantity === 0
            ? `« ${dish.name} » est épuisé.`
            : `Il ne reste que ${dish.available_quantity} portion(s) de « ${dish.name} ».`,
        );
      }
    }

    // Les prix viennent de la carte, jamais du navigateur du client.
    const lines = [...requested].map(([id, quantity]) => {
      const dish = byId.get(id)!;
      return {
        dishId: id,
        dishName: dish.name,
        unitPrice: dish.price,
        quantity,
        lineTotal: round2(dish.price * quantity),
      };
    });
    const itemsTotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const deliveryFee = zone ? round2(zone.fee) : 0;
    const totalAmount = round2(itemsTotal + deliveryFee);

    const ref = await tx.queryOne<{ reference: string }>(
      `SELECT next_document_reference($1, 'online_order', 'CL') AS reference`,
      [restaurantId],
    );
    const reference = ref?.reference ?? `CL-${Date.now()}`;

    const order = await tx.queryOne<{ id: string }>(
      `INSERT INTO online_orders
         (restaurant_id, reference, tracking_code, customer_name, customer_phone, mode,
          zone_id, zone_name, landmark, note, payment_method, items_total, delivery_fee, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        restaurantId,
        reference,
        randomBytes(9).toString('base64url'),
        input.customerName,
        input.customerPhone,
        input.mode,
        zone?.id ?? null,
        zone?.name ?? null,
        input.mode === 'delivery' ? (input.landmark ?? null) : null,
        input.note ?? null,
        input.paymentMethod,
        itemsTotal,
        deliveryFee,
        totalAmount,
      ],
    );
    if (!order) throw new Error('Création de la commande impossible.');

    for (const line of lines) {
      await tx.query(
        `INSERT INTO online_order_items
           (restaurant_id, order_id, dish_id, dish_name, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [restaurantId, order.id, line.dishId, line.dishName, line.unitPrice, line.quantity, line.lineTotal],
      );
    }

    await notify(
      {
        restaurantId,
        to: { permission: 'orders.manage' },
        kind: 'order.new',
        title: 'Nouvelle commande en ligne',
        body: `${reference} · ${input.customerName} · ${formatAmount(totalAmount, restaurant.currency_symbol)} · ${
          zone ? `livraison ${zone.name}` : 'à retirer'
        }`,
        route: 'orders',
        entityId: order.id,
      },
      tx,
    );

    return order.id;
  });

  return publicOrder(await loadOrder(restaurantId, orderId), restaurant);
}

/** Ce que voit le client : sa commande, sans rien de la cuisine du restaurant. */
function publicOrder(
  order: OnlineOrder,
  restaurant: { name: string; slug: string | null; phone: string | null; currency_symbol: string; currency_decimals: number },
) {
  return {
    trackingCode: order.trackingCode,
    reference: order.reference,
    status: order.status,
    mode: order.mode,
    customerName: order.customerName,
    zoneName: order.zoneName,
    landmark: order.landmark,
    paymentMethod: order.paymentMethod,
    itemsTotal: order.itemsTotal,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    items: order.items.map(({ dishName, unitPrice, quantity, lineTotal }) => ({
      dishName,
      unitPrice,
      quantity,
      lineTotal,
    })),
    driverName: order.driver?.fullName.split(' ')[0] ?? null,
    closedReason: order.status === 'rejected' ? order.closedReason : null,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    readyAt: order.readyAt,
    dispatchedAt: order.dispatchedAt,
    deliveredAt: order.deliveredAt ?? (order.mode === 'pickup' ? order.completedAt : null),
    closedAt: order.closedAt,
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      phone: restaurant.phone,
      currencySymbol: restaurant.currency_symbol,
      currencyDecimals: restaurant.currency_decimals,
    },
  };
}

async function restaurantForOrder(restaurantId: string) {
  const row = await queryOne<{
    name: string;
    slug: string | null;
    phone: string | null;
    currency_symbol: string;
    currency_decimals: number;
  }>('SELECT name, slug, phone, currency_symbol, currency_decimals FROM restaurants WHERE id = $1', [
    restaurantId,
  ]);
  if (!row) throw notFound('Commande');
  return row;
}

export async function trackOrder(code: string) {
  const order = await loadOrderByTracking(code);
  return publicOrder(order, await restaurantForOrder(order.restaurantId));
}

export async function cancelTrackedOrder(code: string) {
  const order = await loadOrderByTracking(code);
  await cancelByCustomer(order.restaurantId, order.id);
  return trackOrder(code);
}
