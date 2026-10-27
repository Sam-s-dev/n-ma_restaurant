import { hasPermission, isRole, type Permission } from '../../core/permissions';
import { query, queryOne } from '../../db/pool';
import type { Tx } from '../../db/transaction';

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  entityId: string | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  entity_id: string | null;
  actor_name: string | null;
  read_at: Date | null;
  created_at: Date;
}

const toNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  route: row.route,
  entityId: row.entity_id,
  actorName: row.actor_name,
  readAt: row.read_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

/** Hors transaction : les mêmes requêtes, sur le pool. */
const direct: Tx = { query, queryOne };

export interface NotifyParams {
  restaurantId: string;
  /** Destinataires : ceux qui ont ce droit, et/ou ces comptes précis. */
  to: { permission?: Permission; userIds?: Array<string | null | undefined> };
  /** L'auteur de l'action ne se notifie pas lui-même. */
  exceptUserId?: string | null;
  kind: string;
  title: string;
  body?: string;
  route?: string | null;
  entityId?: string | null;
  actorName?: string | null;
}

/**
 * Dépose une notification chez chaque destinataire actif.
 *
 * Appelée dans la transaction de l'action quand il y en a une : si la vente
 * n'est finalement pas annulée, personne n'est prévenu qu'elle l'a été.
 */
export async function notify(params: NotifyParams, tx: Tx = direct): Promise<number> {
  const members = await tx.query<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE restaurant_id = $1 AND is_active',
    [params.restaurantId],
  );

  const explicit = new Set(params.to.userIds?.filter((id): id is string => Boolean(id)));
  const recipients = members
    .filter(
      (member) =>
        explicit.has(member.id) ||
        (params.to.permission !== undefined &&
          isRole(member.role) &&
          hasPermission(member.role, params.to.permission)),
    )
    .map((member) => member.id)
    .filter((id) => id !== params.exceptUserId);

  if (recipients.length === 0) return 0;

  await tx.query(
    `INSERT INTO notifications
       (restaurant_id, user_id, kind, title, body, route, entity_id, actor_name)
     SELECT $1, recipient, $3, $4, $5, $6, $7, $8
       FROM unnest($2::uuid[]) AS recipient`,
    [
      params.restaurantId,
      recipients,
      params.kind,
      params.title,
      params.body ?? '',
      params.route ?? null,
      params.entityId ?? null,
      params.actorName ?? null,
    ],
  );
  return recipients.length;
}

const SELECT = `
  SELECT id, kind, title, body, route, entity_id, actor_name, read_at, created_at
    FROM notifications`;

/**
 * Liste des notifications d'un compte, avec le nombre de non lues.
 *
 * `since` sert à l'interrogation régulière de l'application : seules les
 * nouveautés reviennent, la réponse reste minuscule quand rien n'a bougé.
 */
export async function listNotifications(
  userId: string,
  options: { since?: Date; limit: number },
): Promise<{ items: Notification[]; unreadCount: number }> {
  const params: unknown[] = [userId];
  let where = 'WHERE user_id = $1';
  if (options.since) {
    params.push(options.since);
    where += ` AND created_at > $${params.length}`;
  }
  params.push(options.limit);

  const [rows, unread] = await Promise.all([
    query<NotificationRow>(
      `${SELECT} ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    ),
    queryOne<{ count: number }>(
      'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    ),
  ]);

  return { items: rows.map(toNotification), unreadCount: unread?.count ?? 0 };
}

/** Marque comme lues les notifications indiquées, ou toutes. */
export async function markRead(userId: string, ids: string[] | 'all'): Promise<number> {
  const rows =
    ids === 'all'
      ? await query(
          `UPDATE notifications SET read_at = now()
            WHERE user_id = $1 AND read_at IS NULL RETURNING id`,
          [userId],
        )
      : await query(
          `UPDATE notifications SET read_at = now()
            WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::uuid[]) RETURNING id`,
          [userId, ids],
        );
  return rows.length;
}
