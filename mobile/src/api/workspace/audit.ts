import { authed, queryString } from '../authed';
import type { Role } from '../permissions';

/** Une ligne du journal d'activité : qui a fait quoi, et quand. */
export interface AuditEntry {
  id: string;
  action: string;
  entityId: string | null;
  details: Record<string, unknown>;
  userId: string | null;
  userName: string;
  userRole: Role;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEntry[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Familles d'actions proposées en filtre : le serveur filtre par préfixe. */
export type AuditFamily = 'sale' | 'cash' | 'expense' | 'dish' | 'member' | 'salary' | 'order';

export function listAudit(
  filters: { page?: number; limit?: number; action?: AuditFamily; userId?: string } = {},
): Promise<AuditPage> {
  return authed<AuditPage>(`/api/audit${queryString(filters)}`);
}
