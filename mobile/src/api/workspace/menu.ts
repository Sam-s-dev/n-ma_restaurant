import { authed, queryString } from '../authed';

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
  photoMediaId?: string | null;
  availableQuantity?: number | null;
}

export async function listCategories(): Promise<Category[]> {
  const { items } = await authed<{ items: Category[] }>('/api/menu/categories');
  return items;
}

export function createCategory(name: string, position = 0): Promise<Category> {
  return authed<Category>('/api/menu/categories', { method: 'POST', body: { name, position } });
}

export function renameCategory(id: string, name: string): Promise<Category> {
  return authed<Category>(`/api/menu/categories/${id}`, { method: 'PATCH', body: { name } });
}

export function deleteCategory(id: string): Promise<void> {
  return authed<void>(`/api/menu/categories/${id}`, { method: 'DELETE' });
}

export async function listDishes(
  filters: { categoryId?: string; search?: string; onlyAvailable?: boolean } = {},
): Promise<Dish[]> {
  const { items } = await authed<{ items: Dish[] }>(
    `/api/menu/dishes${queryString({
      categoryId: filters.categoryId,
      search: filters.search,
      // Le backend attend « true » / « false » en chaîne (schéma Zod).
      onlyAvailable: filters.onlyAvailable ? 'true' : undefined,
    })}`,
  );
  return items;
}

export function createDish(payload: DishPayload): Promise<Dish> {
  return authed<Dish>('/api/menu/dishes', { method: 'POST', body: payload });
}

export function updateDish(id: string, payload: Partial<DishPayload>): Promise<Dish> {
  return authed<Dish>(`/api/menu/dishes/${id}`, { method: 'PATCH', body: payload });
}

export function setDishAvailability(id: string, isAvailable: boolean): Promise<Dish> {
  return authed<Dish>(`/api/menu/dishes/${id}/availability`, {
    method: 'PATCH',
    body: { isAvailable },
  });
}

/** Archive le plat s'il a déjà été vendu, le supprime sinon (côté backend). */
export function deleteDish(id: string): Promise<void> {
  return authed<void>(`/api/menu/dishes/${id}`, { method: 'DELETE' });
}
