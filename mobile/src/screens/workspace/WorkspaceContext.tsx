import { createContext, useContext } from 'react';
import type { Profile } from '../../api/auth';
import type { Permission } from '../../api/permissions';
import type { AppNotification } from '../../api/workspace/notifications';
import type { Currency } from '../../utils/money';

/** Routes de l'espace restaurant : cinq onglets et des modules secondaires. */
export type WorkspaceRoute =
  | 'dashboard'
  | 'sales'
  | 'cash'
  | 'menu'
  | 'more'
  | 'stock'
  | 'expenses'
  | 'staff'
  | 'credits'
  | 'customers'
  | 'settings'
  | 'audit'
  | 'purchases'
  | 'notifications'
  | 'reports'
  | 'orders'
  | 'deliveries'
  | 'online'
  | 'tables'
  | 'kitchen'
  | 'bills';

export interface WorkspaceContextValue {
  profile: Profile;
  /** Notifications reçues, de la plus récente à la plus ancienne. */
  notifications: AppNotification[];
  unreadCount: number;
  /** Marque lues les notifications indiquées, ou toutes. */
  markRead: (ids: string[] | 'all') => void;
  /** Le compte connecté a-t-il ce droit ? Sert à masquer ce qui serait refusé. */
  can: (permission: Permission) => boolean;
  currency: Currency;
  /** Formate un montant dans la devise du restaurant. */
  money: (value: number) => string;
  /** Solde de caisse courant, affiché dans l'en-tête (§7). */
  balance: number;
  /** À appeler après toute écriture qui touche la caisse. */
  refreshBalance: () => void;
  navigate: (route: WorkspaceRoute) => void;
  /** Message de confirmation éphémère. */
  notify: (message: string, tone?: 'success' | 'danger') => void;
  /** Recharge le profil (nom du restaurant, devise) après un changement. */
  reloadProfile: () => void;
  logout: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error('useWorkspace doit être utilisé dans l’espace restaurant.');
  }
  return value;
}
