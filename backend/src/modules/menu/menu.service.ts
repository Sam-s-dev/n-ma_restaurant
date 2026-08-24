import { badRequest, conflict, notFound } from '../../core/errors';
import { buildUpdate } from '../../core/sqlBuilder';
import { query, queryOne } from '../../db/pool';
import { round2 } from '../../utils/money';
import { pruneOrphans } from '../media/media.service';
import type {
  CreateCategoryInput,
  CreateDishInput,
  ListDishesInput,
  UpdateCategoryInput,
  UpdateDishInput,
} from './menu.schemas';

// -------------------------------------------------------------------------
// Catégories
// -------------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  position: number;
  dishesCount: number;
}

export async function listCategories(restaurantId: string): Promise<Category[]> {
  return query<Category>(
    `SELECT c.id, c.name, c.position,
            (SELECT count(*)::int FROM dishes d
              WHERE d.category_id = c.id AND NOT d.is_archived) AS "dishesCount"
       FROM menu_categories c
      WHERE c.restaurant_id = $1
      ORDER BY c.position, c.name`,
    [restaurantId],
  );
}

export async function createCategory(
  restaurantId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const row = await queryOne<Category>(
    `INSERT INTO menu_categories (restaurant_id, name, position)
     VALUES ($1, $2, $3)
     RETURNING id, name, position, 0 AS "dishesCount"`,
    [restaurantId, input.name, input.position],
  );
  if (!row) throw new Error('Création de la catégorie impossible.');
  return row;
}

export async function updateCategory(
  restaurantId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const { setClause, values, nextIndex } = buildUpdate(input, {
    name: 'name',
    position: 'position',
  });

  const row = await queryOne<Category>(
    `UPDATE menu_categories SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1}
      RETURNING id, name, position,
                (SELECT count(*)::int FROM dishes d WHERE d.category_id = menu_categories.id
                   AND NOT d.is_archived) AS "dishesCount"`,
    [...values, id, restaurantId],
  );
  if (!row) throw notFound('Catégorie');
  return row;
}

export async function deleteCategory(restaurantId: string, id: string): Promise<void> {
  const used = await queryOne<{ count: number }>(
    'SELECT count(*)::int AS count FROM dishes WHERE category_id = $1 AND NOT is_archived',
    [id],
  );
  if ((used?.count ?? 0) > 0) {
    throw conflict('Cette catégorie contient encore des plats. Déplacez-les d’abord.');
  }

  const row = await queryOne(
    'DELETE FROM menu_categories WHERE id = $1 AND restaurant_id = $2 RETURNING id',
    [id, restaurantId],
  );
  if (!row) throw notFound('Catégorie');
}

// -------------------------------------------------------------------------
// Plats
// -------------------------------------------------------------------------

export interface Dish {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  photoMediaId: string | null;
  photoUrl: string | null;
  price: number;
  isAvailable: boolean;
  isArchived: boolean;
}

interface DishRow {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  photo_media_id: string | null;
  price: number;
  is_available: boolean;
  is_archived: boolean;
}

const toDish = (row: DishRow): Dish => ({
  id: row.id,
  name: row.name,
  description: row.description,
  categoryId: row.category_id,
  categoryName: row.category_name,
  photoMediaId: row.photo_media_id,
  photoUrl: row.photo_media_id ? `/api/media/${row.photo_media_id}` : null,
  price: row.price,
  isAvailable: row.is_available,
  isArchived: row.is_archived,
});

const DISH_SELECT = `
  SELECT d.id, d.name, d.description, d.category_id, c.name AS category_name,
         d.photo_media_id, d.price, d.is_available, d.is_archived
    FROM dishes d
    LEFT JOIN menu_categories c ON c.id = d.category_id`;

export async function listDishes(
  restaurantId: string,
  input: ListDishesInput,
): Promise<Dish[]> {
  const conditions = ['d.restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (!input.includeArchived) conditions.push('NOT d.is_archived');
  if (input.categoryId) {
    params.push(input.categoryId);
    conditions.push(`d.category_id = $${params.length}`);
  }
  if (input.onlyAvailable) conditions.push('d.is_available');
  if (input.search) {
    params.push(`%${input.search}%`);
    conditions.push(`d.name ILIKE $${params.length}`);
  }

  const rows = await query<DishRow>(
    `${DISH_SELECT} WHERE ${conditions.join(' AND ')}
      ORDER BY c.position NULLS LAST, c.name NULLS LAST, d.name`,
    params,
  );
  return rows.map(toDish);
}

export async function getDish(restaurantId: string, id: string): Promise<Dish> {
  const row = await queryOne<DishRow>(`${DISH_SELECT} WHERE d.id = $1 AND d.restaurant_id = $2`, [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Plat');
  return toDish(row);
}

async function assertMediaBelongs(restaurantId: string, mediaId: string | null | undefined) {
  if (!mediaId) return;
  const media = await queryOne('SELECT 1 FROM media WHERE id = $1 AND restaurant_id = $2', [
    mediaId,
    restaurantId,
  ]);
  if (!media) throw badRequest('Photo introuvable pour ce restaurant.');
}

export async function createDish(restaurantId: string, input: CreateDishInput): Promise<Dish> {
  await assertMediaBelongs(restaurantId, input.photoMediaId);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO dishes
       (restaurant_id, name, description, category_id, photo_media_id, price, is_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      restaurantId,
      input.name,
      input.description ?? null,
      input.categoryId ?? null,
      input.photoMediaId ?? null,
      round2(input.price),
      input.isAvailable,
    ],
  );
  if (!row) throw new Error('Création du plat impossible.');
  return getDish(restaurantId, row.id);
}

export async function updateDish(
  restaurantId: string,
  id: string,
  input: UpdateDishInput,
): Promise<Dish> {
  await assertMediaBelongs(restaurantId, input.photoMediaId);

  const payload = { ...input, ...(input.price !== undefined ? { price: round2(input.price) } : {}) };
  const { setClause, values, nextIndex } = buildUpdate(payload, {
    name: 'name',
    description: 'description',
    categoryId: 'category_id',
    photoMediaId: 'photo_media_id',
    price: 'price',
    isAvailable: 'is_available',
  });

  const row = await queryOne<{ id: string }>(
    `UPDATE dishes SET ${setClause}
      WHERE id = $${nextIndex} AND restaurant_id = $${nextIndex + 1}
      RETURNING id`,
    [...values, id, restaurantId],
  );
  if (!row) throw notFound('Plat');

  if ('photoMediaId' in input) await pruneOrphans(restaurantId).catch(() => undefined);

  return getDish(restaurantId, id);
}

/** §5 — statut disponible / en rupture, géré manuellement. */
export async function setAvailability(
  restaurantId: string,
  id: string,
  isAvailable: boolean,
): Promise<Dish> {
  const row = await queryOne<{ id: string }>(
    `UPDATE dishes SET is_available = $1
      WHERE id = $2 AND restaurant_id = $3 AND NOT is_archived
      RETURNING id`,
    [isAvailable, id, restaurantId],
  );
  if (!row) throw notFound('Plat');
  return getDish(restaurantId, id);
}

/**
 * Un plat déjà vendu n'est jamais supprimé : il est archivé, pour que les
 * tickets et les statistiques passés restent lisibles.
 */
export async function archiveDish(restaurantId: string, id: string): Promise<void> {
  const sold = await queryOne<{ count: number }>(
    'SELECT count(*)::int AS count FROM sale_items WHERE dish_id = $1',
    [id],
  );

  if ((sold?.count ?? 0) > 0) {
    const row = await queryOne(
      `UPDATE dishes SET is_archived = true, is_available = false
        WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
      [id, restaurantId],
    );
    if (!row) throw notFound('Plat');
    return;
  }

  const row = await queryOne('DELETE FROM dishes WHERE id = $1 AND restaurant_id = $2 RETURNING id', [
    id,
    restaurantId,
  ]);
  if (!row) throw notFound('Plat');
}
