import type { Profile } from '../../api/auth';
import { can, roleOf } from '../../api/permissions';
import type { Role } from '../../api/permissions';
import type { Permission } from '../../api/permissions';
import type { WorkspaceRoute } from './WorkspaceContext';

/** Droit nécessaire pour ouvrir chaque écran ; plusieurs = l'un d'eux suffit. */
const ROUTE_PERMISSIONS: Record<WorkspaceRoute, Permission[] | null> = {
  dashboard: ['dashboard.view'],
  sales: ['sales.create'],
  cash: ['cash.view'],
  menu: ['menu.view'],
  stock: ['stock.view'],
  expenses: ['expenses.manage'],
  purchases: ['purchases.request', 'purchases.approve'],
  staff: ['staff.manage'],
  credits: ['credits.view'],
  customers: ['customers.manage'],
  audit: ['audit.view'],
  reports: ['reports.export'],
  orders: ['orders.manage'],
  deliveries: ['deliveries.handle'],
  online: ['settings.manage'],
  tables: ['tables.serve'],
  kitchen: ['kitchen.handle'],
  bills: ['bills.settle'],
  // Le compte personnel (mot de passe, déconnexion) est ouvert à tous.
  settings: null,
  notifications: null,
  more: null,
};

/**
 * Les onglets de chaque métier, dans l'ordre où il s'en sert : le gérant
 * retrouve ses onglets habituels, le serveur arrive sur les tables, le
 * cuisinier sur l'écran cuisine. Le reste est dans « Plus ».
 */
const TABS_BY_ROLE: Record<Role, WorkspaceRoute[]> = {
  manager: ['dashboard', 'sales', 'cash', 'menu'],
  cashier: ['sales', 'bills', 'orders', 'menu'],
  storekeeper: ['stock', 'purchases'],
  driver: ['deliveries'],
  waiter: ['tables', 'menu'],
  cook: ['kitchen', 'menu'],
};

const MAX_TABS = 4; // plus l'onglet « Plus »

export function canOpen(profile: Profile, route: WorkspaceRoute): boolean {
  const required = ROUTE_PERMISSIONS[route];
  return required === null || required.some((permission) => can(profile, permission));
}

export function tabRoutesFor(profile: Profile): WorkspaceRoute[] {
  const tabs = TABS_BY_ROLE[roleOf(profile)].filter((route) => canOpen(profile, route)).slice(0, MAX_TABS);
  return [...tabs, 'more'];
}

/** Premier écran à l'ouverture : celui du travail de la personne. */
export function homeRouteFor(profile: Profile): WorkspaceRoute {
  return tabRoutesFor(profile)[0] ?? 'more';
}
