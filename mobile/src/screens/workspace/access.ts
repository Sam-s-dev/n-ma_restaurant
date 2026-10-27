import type { Profile } from '../../api/auth';
import { can } from '../../api/permissions';
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
  // Le compte personnel (mot de passe, déconnexion) est ouvert à tous.
  settings: null,
  notifications: null,
  more: null,
};

/**
 * Ordre de préférence pour la barre d'onglets : le gérant retrouve
 * exactement ses cinq onglets habituels, le caissier et le magasinier
 * voient les leurs remonter à la place de ceux qui leur sont fermés.
 */
const TAB_CANDIDATES: WorkspaceRoute[] = [
  'dashboard',
  'sales',
  'cash',
  'menu',
  'stock',
  'purchases',
  'credits',
];

const MAX_TABS = 4; // plus l'onglet « Plus »

export function canOpen(profile: Profile, route: WorkspaceRoute): boolean {
  const required = ROUTE_PERMISSIONS[route];
  return required === null || required.some((permission) => can(profile, permission));
}

export function tabRoutesFor(profile: Profile): WorkspaceRoute[] {
  const tabs = TAB_CANDIDATES.filter((route) => canOpen(profile, route)).slice(0, MAX_TABS);
  return [...tabs, 'more'];
}

/** Premier écran à l'ouverture : celui du travail de la personne. */
export function homeRouteFor(profile: Profile): WorkspaceRoute {
  return tabRoutesFor(profile)[0] ?? 'more';
}
