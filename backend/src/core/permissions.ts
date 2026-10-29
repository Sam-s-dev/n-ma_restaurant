/**
 * Rôles et droits d'un compte de restaurant.
 *
 * Les droits sont fixes par rôle et vivent ici plutôt qu'en base : une
 * matrice personnalisable demanderait au gérant de configurer avant de
 * travailler, et un réglage oublié ouvrirait la caisse à tout le monde.
 * L'application mobile reçoit la liste à la connexion et s'y conforme ;
 * le serveur, lui, refuse quoi qu'il arrive.
 */

export const ROLES = ['manager', 'cashier', 'storekeeper', 'driver', 'waiter', 'cook'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  manager: 'Gérant',
  cashier: 'Caissier',
  storekeeper: 'Magasinier',
  driver: 'Livreur',
  waiter: 'Serveur',
  cook: 'Cuisinier',
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
  // Dépenses et achats
  'expenses.manage',
  'purchases.request', // demander un achat, puis l'effectuer une fois approuvé
  'purchases.approve',
  // Caisse et finances
  'cash.balance', // le solde seul, pour savoir ce qu'on peut demander
  'cash.view', // solde, mouvements et répartition
  'cash.manage',
  'cash.session', // ouvrir et clôturer la caisse (comptage à l'aveugle)
  // Commandes en ligne
  'orders.manage', // accepter, préparer, confier au livreur, encaisser
  'deliveries.handle', // ses propres courses, et rien d'autre
  // Service en salle
  'tables.serve', // ouvrir une addition, envoyer en cuisine, demander l'addition
  'kitchen.handle', // l'écran cuisine : préparer, marquer prêt
  'bills.settle', // encaisser les additions des tables
  'dashboard.view',
  'reports.export',
  // Administration
  'staff.manage',
  'team.manage',
  'settings.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  // Le gérant fait tout, y compris la comptabilité. Il ne reçoit pas de
  // courses : livrer est le métier du livreur.
  manager: new Set(PERMISSIONS.filter((permission) => permission !== 'deliveries.handle')),

  // Le caissier sert les clients. Il ne voit ni le solde de la caisse ni
  // les chiffres du restaurant, seulement ses propres ventes.
  cashier: new Set<Permission>([
    'sales.create',
    'cash.session',
    'customers.manage',
    'credits.view',
    'credits.repay',
    'menu.view',
    'menu.availability',
    'orders.manage',
    'bills.settle',
  ]),

  // Le magasinier tient le stock. Il voit ce qu'il y a en caisse pour
  // calibrer ses demandes, mais n'achète qu'après l'accord du gérant.
  storekeeper: new Set<Permission>([
    'stock.view',
    'stock.manage',
    'cash.balance',
    'purchases.request',
  ]),

  // Le livreur ne voit que les courses qu'on lui confie : l'adresse, le
  // téléphone du client et le montant à encaisser.
  driver: new Set<Permission>(['deliveries.handle']),

  // Le serveur prend les commandes à table. Il ne touche pas à l'argent :
  // le caissier encaisse l'addition qu'il a demandée.
  waiter: new Set<Permission>(['tables.serve', 'menu.view']),

  // Le cuisinier prépare. Il ne voit ni la caisse ni les chiffres, et
  // marque un plat épuisé quand un ingrédient manque.
  cook: new Set<Permission>(['kitchen.handle', 'menu.view', 'menu.availability']),
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
