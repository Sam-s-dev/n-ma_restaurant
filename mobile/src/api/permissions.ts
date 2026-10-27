import type { Profile } from './auth';

/**
 * Rôles et droits, tels que le serveur les envoie à la connexion.
 *
 * L'application s'en sert pour n'afficher que ce que la personne peut
 * faire : masquer un bouton ne protège rien, c'est le serveur qui refuse.
 * La liste de référence est dans backend/src/core/permissions.ts.
 */
export type Role = 'manager' | 'cashier' | 'storekeeper';

export type Permission =
  | 'sales.create'
  | 'sales.view_all'
  | 'sales.cancel'
  | 'sales.discount'
  | 'customers.manage'
  | 'customers.delete'
  | 'credits.view'
  | 'credits.repay'
  | 'menu.view'
  | 'menu.availability'
  | 'menu.manage'
  | 'stock.view'
  | 'stock.manage'
  | 'expenses.manage'
  | 'purchases.request'
  | 'purchases.approve'
  | 'cash.balance'
  | 'cash.view'
  | 'cash.manage'
  | 'dashboard.view'
  | 'staff.manage'
  | 'team.manage'
  | 'settings.manage'
  | 'audit.view';

export const ROLES: Role[] = ['manager', 'cashier', 'storekeeper'];

export const ROLE_LABELS: Record<Role, string> = {
  manager: 'Gérant',
  cashier: 'Caissier',
  storekeeper: 'Magasinier',
};

/** Ce que le gérant lit au moment de choisir un rôle. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  manager: 'Tout le restaurant : caisse, finances, personnel, équipe et réglages.',
  cashier:
    'Encaisse les ventes, gère les clients et les remboursements. Ne voit ni la caisse ni les chiffres.',
  storekeeper:
    'Tient le stock et voit le solde de la caisse. Demande les achats, qu’il effectue après votre accord.',
};

/**
 * Un profil enregistré par une version précédente de l'application n'a
 * pas de liste de droits. Les rôles n'existaient pas encore : tous les
 * comptes étaient gérants, et ils le sont restés.
 */
export function can(profile: Profile, permission: Permission): boolean {
  const permissions = profile.user.permissions;
  return permissions === undefined || permissions.includes(permission);
}

export function roleOf(profile: Profile): Role {
  return profile.user.role ?? 'manager';
}
