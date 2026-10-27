import { offsetOf, paginate, type Paginated } from '../../core/pagination';
import { query, queryOne } from '../../db/pool';
import type { ListAuditInput } from './audit.schemas';

export interface AuditEntry {
  id: string;
  action: string;
  entityId: string | null;
  details: Record<string, unknown>;
  userId: string | null;
  userName: string;
  userRole: string;
  createdAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  user_id: string | null;
  user_name: string;
  user_role: string;
  created_at: Date;
}

export async function recordAudit(entry: {
  restaurantId: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entityId: string | null;
  details: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_log
       (restaurant_id, user_id, user_name, user_role, action, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.restaurantId,
      entry.userId,
      entry.userName,
      entry.userRole,
      entry.action,
      entry.entityId,
      JSON.stringify(entry.details),
    ],
  );
}

export async function listAudit(
  restaurantId: string,
  input: ListAuditInput,
): Promise<Paginated<AuditEntry>> {
  const conditions = ['restaurant_id = $1'];
  const params: unknown[] = [restaurantId];

  if (input.userId) {
    params.push(input.userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (input.action) {
    // Préfixe : `sale` couvre sale.created, sale.cancelled…
    params.push(`${input.action}%`);
    conditions.push(`action LIKE $${params.length}`);
  }
  if (input.from) {
    params.push(input.from);
    conditions.push(`created_at >= $${params.length}::date`);
  }
  if (input.to) {
    params.push(input.to);
    conditions.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM audit_log ${where}`,
    params,
  );

  params.push(input.limit, offsetOf(input));
  const rows = await query<AuditRow>(
    `SELECT id, action, entity_id, details, user_id, user_name, user_role, created_at
       FROM audit_log ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return paginate(
    rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityId: row.entity_id,
      details: row.details,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      createdAt: row.created_at.toISOString(),
    })),
    total?.count ?? 0,
    input,
  );
}
