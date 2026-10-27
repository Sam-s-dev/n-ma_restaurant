/**
 * Rôles et droits d'un compte de restaurant.
 *
 * Les droits sont fixes par rôle et vivent ici plutôt qu'en base : une
 * matrice personnalisable demanderait au gérant de configurer avant de
 * travailler, et un réglage oublié ouvrirait la caisse à tout le monde.
 * L'application mobile reçoit la liste à la connexion et s'y conforme ;
 * le serveur, lui, refuse quoi qu'il arrive.
 */

export const ROLES = ['manager', 'cashier', 'storekeeper'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  manager: 'Gérant',
  cashier: 'Caissier',
  storekeeper: 'Magasinier',
};

export const PERMISSIONS = [
  // Ventes
  'sales.create',
  'sales.view_all', // sans lui, on ne voit que ses propres ventes
  'sales.cancel',
  'sales.discount', // prix libre sur une ligne, vente antidatée
  // Clients et créances
  'customers.manage',
  'customers.delete',
  'credits.view',
  'credits.repay',
  // Menu
  'menu.view',
  'menu.availability',
  'menu.manage',
  // Stock
  'stock.view',
  'stock.manage',
  // Dépenses
  'expenses.stock_purchase',
  'expenses.manage', // toutes catégories, annulation, liste complète
  // Caisse et finances
  'cash.view',
  'cash.manage',
  'dashboard.view',
  // Administration
  'staff.manage',
  'team.manage',
  'settings.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  // Le gérant fait tout, y compris la comptabilité : pas de rôle à part.
  manager: new Set(PERMISSIONS),

  // Le caissier sert les clients. Il ne voit ni le solde de la caisse ni
  // les chiffres du restaurant, seulement ses propres ventes.
  cashier: new Set<Permission>([
    'sales.create',
    'customers.manage',
    'credits.view',
    'credits.repay',
    'menu.view',
    'menu.availability',
  ]),

  // Le magasinier tient le stock et enregistre les achats de marchandise.
  storekeeper: new Set<Permission>(['stock.view', 'stock.manage', 'expenses.stock_purchase']),
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsOf(role: Role): Permission[] {
  return PERMISSIONS.filter((permission) => ROLE_PERMISSIONS[role].has(permission));
}
