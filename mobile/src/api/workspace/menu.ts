import { authed, queryString } from '../authed';
import { withSnapshot } from '../offline';
import { invalidateCache } from '../cache';

/** §5 — Catégories et plats du menu. */
export interface Category {
  id: string;
  name: string;
  position: number;
  dishesCount: number;
}

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
  /** Proposé sur le mini-site de commande en ligne. */
  isOnline: boolean;
  isArchived: boolean;
  /** Portions restantes ; null quand la quantité n'est pas suivie (§5). */
  availableQuantity: number | null;
}

export interface DishPayload {
  name: string;
  price: number;
  categoryId?: string | null;
  description?: string | null;
  isAvailable?: boolean;
  isOnline?: boolean;
  photoMediaId?: string | null;
  availableQuantity?: number | null;
}

export async function listCategories(): Promise<Category[]> {
  // Gardée sur le téléphone : la carte reste vendable pendant une coupure.
  const { items } = await withSnapshot('menu:categories', () =>
    authed<{ items: Category[] }>('/api/menu/categories'),
  );
  return items;
}

export function createCategory(name: string, position = 0): Promise<Category> {
  return authed<Category>('/api/menu/categories', {
    method: 'POST',
    body: { name, position },
  }).then(afterMenuChange);
}

export function renameCategory(id: string, name: string): Promise<Category> {
  return authed<Category>(`/api/menu/categories/${id}`, {
    method: 'PATCH',
    body: { name },
  }).then(afterMenuChange);
}

export function deleteCategory(id: string): Promise<void> {
  return authed<void>(`/api/menu/categories/${id}`, { method: 'DELETE' }).then(afterMenuChange);
}

export async function listDishes(
  filters: { categoryId?: string; search?: string; onlyAvailable?: boolean } = {},
): Promise<Dish[]> {
  const path = `/api/menu/dishes${queryString({
    categoryId: filters.categoryId,
    search: filters.search,
    // Le backend attend « true » / « false » en chaîne (schéma Zod).
    onlyAvailable: filters.onlyAvailable ? 'true' : undefined,
  })}`;
  const { items } = await withSnapshot(`menu:dishes:${path}`, () => authed<{ items: Dish[] }>(path));
  return items;
}

export function createDish(payload: DishPayload): Promise<Dish> {
  return authed<Dish>('/api/menu/dishes', { method: 'POST', body: payload }).then(afterMenuChange);
}

/**
 * Toute écriture sur la carte périme le menu mis en cache — et le tableau
 * de bord, qui compte les plats et les ruptures.
 */
function afterMenuChange<T>(result: T): T {
  invalidateCache('menu:', 'dashboard:');
  return result;
}

export function updateDish(id: string, payload: Partial<DishPayload>): Promise<Dish> {
  return authed<Dish>(`/api/menu/dishes/${id}`, { method: 'PATCH', body: payload }).then(
    afterMenuChange,
  );
}

export function setDishAvailability(id: string, isAvailable: boolean): Promise<Dish> {
  return authed<Dish>(`/api/menu/dishes/${id}/availability`, {
    method: 'PATCH',
    body: { isAvailable },
  }).then(afterMenuChange);
}

/** Archive le plat s'il a déjà été vendu, le supprime sinon (côté backend). */
export function deleteDish(id: string): Promise<void> {
  return authed<void>(`/api/menu/dishes/${id}`, { method: 'DELETE' }).then(afterMenuChange);
}
