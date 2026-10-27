import { authed, queryString } from '../authed';
import type { WorkspaceRoute } from '../../screens/workspace/WorkspaceContext';

/** Une notification reçue par le compte connecté. */
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Écran à ouvrir au toucher. */
  route: WorkspaceRoute | null;
  entityId: string | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  items: AppNotification[];
  unreadCount: number;
}

/**
 * Sans `since` : les dernières notifications. Avec `since` : seulement
 * celles arrivées depuis — c'est l'appel répété toutes les dix secondes, il
 * doit rester minuscule quand rien n'a bougé.
 */
export function listNotifications(
  options: { since?: string; limit?: number } = {},
): Promise<NotificationsPage> {
  return authed<NotificationsPage>(`/api/notifications${queryString(options)}`, {
    // Une interrogation qui échoue sera refaite dix secondes plus tard :
    // inutile d'attendre une minute qu'un serveur endormi réponde.
    timeoutMs: 15_000,
  });
}

export function markNotificationsRead(ids: string[] | 'all'): Promise<{ updated: number }> {
  return authed<{ updated: number }>('/api/notifications/read', {
    method: 'POST',
    body: ids === 'all' ? { all: true } : { ids },
  });
}
