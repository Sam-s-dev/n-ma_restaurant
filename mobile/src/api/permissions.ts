import type { Profile } from './auth';

/**
 * Rôles et droits, tels que le serveur les envoie à la connexion.
 *
 * L'application s'en sert pour n'afficher que ce que la personne peut
 * faire : masquer un bouton ne protège rien, c'est le serveur qui refuse.
 * La liste de référence est dans backend/src/core/permissions.ts.
 */
export type Role = 'manager' | 'cashier' | 'storekeeper' | 'driver' | 'waiter' | 'cook';

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
  | 'cash.session'
  | 'orders.manage'
  | 'deliveries.handle'
  | 'tables.serve'
  | 'kitchen.handle'
  | 'bills.settle'
  | 'reports.export'
  | 'cash.manage'
  | 'dashboard.view'
  | 'staff.manage'
  | 'team.manage'
  | 'settings.manage'
  | 'audit.view';

export const ROLES: Role[] = ['manager', 'cashier', 'storekeeper', 'driver', 'waiter', 'cook'];

export const ROLE_LABELS: Record<Role, string> = {
  manager: 'Gérant',
  cashier: 'Caissier',
  storekeeper: 'Magasinier',
  driver: 'Livreur',
  waiter: 'Serveur',
  cook: 'Cuisinier',
};

/** Ce que le gérant lit au moment de choisir un rôle. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  manager: 'Tout le restaurant : caisse, finances, personnel, équipe et réglages.',
  cashier:
    'Encaisse les ventes, les additions des tables et les commandes en ligne, gère les clients et les remboursements. Ne voit ni la caisse ni les chiffres.',
  storekeeper:
    'Tient le stock et voit le solde de la caisse. Demande les achats, qu’il effectue après votre accord.',
  driver:
    'Ne voit que les courses que vous lui confiez : adresse, téléphone du client, montant à encaisser.',
  waiter:
    'Prend les commandes à table et les envoie en cuisine, demande l’addition. Ne touche pas à l’argent.',
  cook: 'L’écran cuisine : prépare les tickets, marque les plats prêts ou épuisés. Ne voit ni la caisse ni les chiffres.',
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
