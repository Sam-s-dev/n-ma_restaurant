import { conflict, notFound, unauthorized } from '../../core/errors';
import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import { hashPassword, verifyPassword } from '../../utils/password';
import { issueSession, revokeAllSessions, type IssuedSession } from '../auth/session.service';
import type { ListRestaurantsInput } from './superadmin.schemas';

export interface RestaurantSummary {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string;
  statusReason: string | null;
  currencyCode: string;
  currencySymbol: string;
  currencyDecimals: number;
  logoMediaId: string | null;
  slug: string | null;
  onlineAllowed: boolean;
  onlineEnabled: boolean;
  ownerName: string | null;
  ownerEmail: string | null;
  usersCount: number;
  salesCount: number;
  createdAt: string;
  activatedAt: string | null;
  disabledAt: string | null;
}

export async function login(
  email: string,
  password: string,
  userAgent?: string,
): Promise<IssuedSession & { admin: { id: string; email: string; fullName: string } }> {
  const row = await queryOne<{
    id: string;
    email: string;
    full_name: string;
    password_hash: string;
    is_active: boolean;
  }>('SELECT id, email, full_name, password_hash, is_active FROM super_admins WHERE email = $1', [
    email,
  ]);

  const failure = unauthorized('E-mail ou mot de passe incorrect.');
  if (!row) {
    await verifyPassword(password, '$2b$12$0000000000000000000000000000000000000000000000000000');
    throw failure;
  }
  if (!(await verifyPassword(password, row.password_hash))) throw failure;
  if (!row.is_active) throw unauthorized('Compte désactivé.');

  await query('UPDATE super_admins SET last_login_at = now() WHERE id = $1', [row.id]);

  const session = await issueSession({
    subjectType: 'super_admin',
    subjectId: row.id,
    ...(userAgent ? { userAgent } : {}),
  });

  return { ...session, admin: { id: row.id, email: row.email, fullName: row.full_name } };
}

interface RestaurantRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: string;
  status_reason: string | null;
  currency_code: string;
  currency_symbol: string;
  currency_decimals: number;
  logo_media_id: string | null;
  slug: string | null;
  online_allowed: boolean;
  online_enabled: boolean;
  owner_name: string | null;
  owner_email: string | null;
  users_count: number;
  sales_count: number;
  created_at: Date;
  activated_at: Date | null;
  disabled_at: Date | null;
}

function toSummary(row: RestaurantRow): RestaurantSummary {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    status: row.status,
    statusReason: row.status_reason,
    currencyCode: row.currency_code,
    currencySymbol: row.currency_symbol,
    currencyDecimals: row.currency_decimals,
    logoMediaId: row.logo_media_id,
    slug: row.slug,
    onlineAllowed: row.online_allowed,
    onlineEnabled: row.online_enabled,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    usersCount: row.users_count,
    salesCount: row.sales_count,
    createdAt: row.created_at.toISOString(),
    activatedAt: row.activated_at?.toISOString() ?? null,
    disabledAt: row.disabled_at?.toISOString() ?? null,
  };
}

const RESTAURANT_SELECT = `
  SELECT r.id, r.name, r.address, r.phone, r.status, r.status_reason,
         r.currency_code, r.currency_symbol, r.currency_decimals, r.logo_media_id,
         r.slug, r.online_allowed, r.online_enabled,
         r.created_at, r.activated_at, r.disabled_at,
         owner.full_name AS owner_name,
         owner.email     AS owner_email,
         (SELECT count(*) FROM users u WHERE u.restaurant_id = r.id)  AS users_count,
         (SELECT count(*) FROM sales s WHERE s.restaurant_id = r.id)  AS sales_count
    FROM restaurants r
    LEFT JOIN users owner ON owner.restaurant_id = r.id AND owner.is_owner`;

export async function listRestaurants(
  input: ListRestaurantsInput,
): Promise<Paginated<RestaurantSummary>> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (input.status) {
    params.push(input.status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (input.search) {
    params.push(`%${input.search}%`);
    conditions.push(`(r.name ILIKE $${params.length} OR owner.email ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM restaurants r
       LEFT JOIN users owner ON owner.restaurant_id = r.id AND owner.is_owner
       ${where}`,
    params,
  );

  params.push(input.limit, offsetOf(input));
  const rows = await query<RestaurantRow>(
    `${RESTAURANT_SELECT} ${where}
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
        r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return paginate(rows.map(toSummary), totalRow?.count ?? 0, input);
}

export async function getRestaurant(id: string): Promise<RestaurantSummary> {
  const row = await queryOne<RestaurantRow>(`${RESTAURANT_SELECT} WHERE r.id = $1`, [id]);
  if (!row) throw notFound('Restaurant');
  return toSummary(row);
}

/** §2.a — activation d'un restaurant (après paiement, vérification...). */
export async function activateRestaurant(id: string, reason?: string): Promise<RestaurantSummary> {
  const current = await queryOne<{ status: string }>(
    'SELECT status FROM restaurants WHERE id = $1',
    [id],
  );
  if (!current) throw notFound('Restaurant');
  if (current.status === 'active') throw conflict('Ce restaurant est déjà actif.');

  await query(
    `UPDATE restaurants
        SET status = 'active',
            status_reason = $2,
            activated_at = COALESCE(activated_at, now()),
            disabled_at = NULL
      WHERE id = $1`,
    [id, reason ?? null],
  );

  return getRestaurant(id);
}

/** §2.a — désactivation : le restaurant ne peut plus se connecter. */
export async function disableRestaurant(id: string, reason: string): Promise<RestaurantSummary> {
  const current = await queryOne<{ status: string }>(
    'SELECT status FROM restaurants WHERE id = $1',
    [id],
  );
  if (!current) throw notFound('Restaurant');
  if (current.status === 'disabled') throw conflict('Ce restaurant est déjà désactivé.');

  await query(
    `UPDATE restaurants
        SET status = 'disabled', status_reason = $2, disabled_at = now()
      WHERE id = $1`,
    [id, reason],
  );

  // Les sessions ouvertes des utilisateurs de ce restaurant sont coupées.
  await query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE revoked_at IS NULL
        AND subject_type = 'user'
        AND subject_id IN (SELECT id FROM users WHERE restaurant_id = $1)`,
    [id],
  );

  return getRestaurant(id);
}

/**
 * Mini-site autorisé ou non. Le retirer ferme aussitôt la page publique ;
 * le rendre ne la rouvre pas : c'est au gérant de reprendre les commandes.
 */
export async function setOnlineAllowed(id: string, allowed: boolean): Promise<RestaurantSummary> {
  const row = await queryOne(
    `UPDATE restaurants
        SET online_allowed = $2,
            online_enabled = online_enabled AND $2
      WHERE id = $1 RETURNING id`,
    [id, allowed],
  );
  if (!row) throw notFound('Restaurant');
  return getRestaurant(id);
}

export async function platformStats(): Promise<Record<string, number>> {
  const row = await queryOne<Record<string, number>>(`
    SELECT
      (SELECT count(*)::int FROM restaurants)                              AS restaurants_total,
      (SELECT count(*)::int FROM restaurants WHERE status = 'pending')     AS restaurants_pending,
      (SELECT count(*)::int FROM restaurants WHERE status = 'active')      AS restaurants_active,
      (SELECT count(*)::int FROM restaurants WHERE status = 'disabled')    AS restaurants_disabled,
      (SELECT count(*)::int FROM users)                                    AS users_total,
      (SELECT count(*)::int FROM sales WHERE sold_at >= now() - interval '30 days') AS sales_last_30d
  `);
  return row ?? {};
}

export async function changePassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const row = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM super_admins WHERE id = $1',
    [adminId],
  );
  if (!row) throw unauthorized();
  if (!(await verifyPassword(currentPassword, row.password_hash))) {
    throw unauthorized('Mot de passe actuel incorrect.');
  }
  await query('UPDATE super_admins SET password_hash = $1 WHERE id = $2', [
    await hashPassword(newPassword),
    adminId,
  ]);
  await revokeAllSessions('super_admin', adminId);
}
