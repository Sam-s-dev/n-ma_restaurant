# Référence de l'API

Base : `http://localhost:4000` en local, l'URL Render en production.

Toutes les réponses sont en JSON. Les erreurs suivent la forme :

```json
{ "error": { "code": "BAD_REQUEST", "message": "…", "details": [{ "field": "email", "message": "…" }] } }
```

## Authentification

Deux espaces distincts, deux jetons distincts.

| En-tête | Obtenu par |
|---|---|
| `Authorization: Bearer <accessToken>` (gérant) | `POST /api/auth/login` |
| `Authorization: Bearer <accessToken>` (éditeur) | `POST /api/super-admin/login` |

Le jeton d'accès expire au bout de 2 h ; `POST /api/auth/refresh` le renouvelle
à partir du `refreshToken` (valable 30 jours, à usage unique — il est remplacé
à chaque appel).

---

## §2.a — Espace Super Admin

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/super-admin/login` | Connexion de l'éditeur |
| `GET` | `/api/super-admin/me` | Profil |
| `POST` | `/api/super-admin/change-password` | Changer son mot de passe |
| `GET` | `/api/super-admin/stats` | Chiffres de la plateforme |
| `GET` | `/api/super-admin/restaurants` | Liste (`?status=pending&search=&page=&limit=`) |
| `GET` | `/api/super-admin/restaurants/:id` | Détail d'un restaurant |
| `POST` | `/api/super-admin/restaurants/:id/activate` | Activer le compte |
| `POST` | `/api/super-admin/restaurants/:id/disable` | Désactiver (`{ "reason": "…" }`) |

La désactivation révoque immédiatement toutes les sessions ouvertes du
restaurant concerné.

---

## §2.b — Inscription et connexion d'un restaurant

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/auth/register` | Créer l'espace (statut `pending`) |
| `POST` | `/api/auth/login` | Connexion |
| `POST` | `/api/auth/refresh` | Renouveler la session |
| `POST` | `/api/auth/logout` | Révoquer le refresh token |
| `GET` | `/api/auth/me` | Profil + restaurant |
| `POST` | `/api/auth/change-password` | Changer son mot de passe |
| `GET` | `/api/auth/invitations?token=…` | Consulter une invitation |
| `POST` | `/api/auth/invitations/accept` | Rejoindre le restaurant |

### Équipe

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/users` | Membres du restaurant |
| `POST` | `/api/users` | Créer un compte (`fullName`, `email`, `password`, `phone?`, `role`, et `employeeId` **ou** `employee: { position, monthlySalary, hireDate }`) |
| `PATCH` | `/api/users/:id` | Renommer / activer / désactiver / changer de rôle / rattacher (`employeeId`) |
| `DELETE` | `/api/users/:id` | Retirer de l'équipe (désactive si le compte a saisi des écritures) |
| `POST` | `/api/users/invitations` | Inviter (`{ "email": "…", "role": "cashier" }`) — renvoie le `token` **une seule fois** |
| `GET` | `/api/users/invitations/list` | Invitations en attente |
| `DELETE` | `/api/users/invitations/:id` | Révoquer une invitation |

### Rôles

Chaque compte a un rôle : `manager` (gérant), `cashier` (caissier),
`storekeeper` (magasinier), `driver` (livreur), `waiter` (serveur) ou
`cook` (cuisinier). Le serveur a `tables.serve` et `menu.view` ; le
cuisinier `kitchen.handle`, `menu.view` et `menu.availability` ; le caissier
encaisse les additions avec `bills.settle`. Les droits sont fixes par rôle et définis dans
[backend/src/core/permissions.ts](backend/src/core/permissions.ts). Le profil
renvoyé par `/api/auth/login` et `/api/auth/me` contient `user.role` et
`user.permissions`. L'application mobile s'en sert pour masquer ce qui serait
refusé, mais c'est le serveur qui contrôle : toute action interdite répond `403`.

| | Gérant | Caissier | Magasinier | Livreur |
|---|:-:|:-:|:-:|:-:|
| Encaisser, imprimer un ticket | ✅ | ✅ (ses propres ventes, caisse ouverte) | — | — |
| Commandes en ligne : accepter, confier au livreur, encaisser | ✅ | ✅ | — | — |
| Ses courses : partir, livrer, signaler un problème | — | — | — | ✅ |
| Réglages du mini-site et zones de livraison | ✅ | — | — | — |
| Ouvrir et clôturer la caisse (comptage à l'aveugle) | ✅ | ✅ | — | — |
| Historique des clôtures, correction d'écart, rapports et exports | ✅ | — | — | — |
| Annuler une vente, prix libre, vente antidatée | ✅ | — | — | — |
| Clients (sauf suppression), créances, remboursements | ✅ | ✅ | — | — |
| Consulter le menu, marquer un plat disponible ou épuisé | ✅ | ✅ | — | — |
| Créer ou modifier un plat, gérer les catégories | ✅ | — | — | — |
| Stock : consulter, corriger, déclarer une perte | ✅ | — | ✅ | — |
| Voir le solde de la caisse (sans les cumuls ni les mouvements) | ✅ | — | ✅ | — |
| Demander un achat, l'effectuer une fois approuvé | ✅ | — | ✅ (ses demandes seulement) | — |
| Approuver ou refuser une demande d'achat | ✅ | — | — | — |
| Dépenses (toutes catégories), annulation de dépense | ✅ | — | — | — |
| Caisse détaillée, tableau de bord, plats vedettes | ✅ | — | — | — |
| Personnel et salaires, équipe, paramètres, journal | ✅ | — | — | — |

- Le créateur de l'espace reste gérant ; personne ne peut changer son propre rôle.
- Le rôle est relu à chaque requête : un changement s'applique immédiatement.
  Il révoque aussi les sessions de la personne, pour que l'application se
  recharge avec ses nouveaux écrans.
- Les comptes existant avant l'arrivée des rôles sont tous gérants.

### Journal d'activité

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/audit` | Actions sensibles, de la plus récente à la plus ancienne (`?action=sale&userId=&from=&to=&page=`) |

Chaque entrée indique l'auteur (nom et rôle au moment de l'action),
l'action (`sale.cancelled`, `cash.adjusted`, `dish.updated`, `member.updated`…),
l'objet concerné et les détails saisis (motif, montant, nouveau prix), sans
mot de passe. Seules les actions réussies sont inscrites. Le journal est en
écriture seule : rien ne s'y modifie ni ne s'y efface.

### Notifications

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/notifications` | Les siennes + `unreadCount` (`?since=<ISO>&limit=`) |
| `POST` | `/api/notifications/read` | `{ "ids": ["…"] }` ou `{ "all": true }` |

L'application interroge `?since=` toutes les 10 secondes : seules les
nouveautés reviennent. Chaque destinataire a sa propre ligne (lu / non lu).

| Événement (`kind`) | Destinataires |
|---|---|
| `purchase.requested` | Comptes qui approuvent les achats |
| `purchase.approved`, `purchase.rejected` | Le demandeur |
| `purchase.completed` | Les approbateurs et le demandeur (sauf l'auteur) |
| `stock.low` | Comptes qui voient le stock, au moment où le seuil est franchi |
| `sale.cancelled` | Le caissier qui avait encaissé la vente |
| `member.role_changed` | La personne concernée |
| `attendance.late`, `attendance.absent`, `employee.*` | L'employé, s'il a un compte |

## Demandes d'achat

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/purchases` | Liste (`?status=`) + `pendingCount`, `approvedCount` |
| `POST` | `/api/purchases` | Demander (`stockItemId` ou `itemName` + `unit`, `quantity`, `estimatedAmount`, `reason?`) |
| `GET` | `/api/purchases/:id` | Détail |
| `POST` | `/api/purchases/:id/approve` | Approuver (`approvedAmount?` = plafond, `note?`) |
| `POST` | `/api/purchases/:id/reject` | Refuser (`note` obligatoire) |
| `POST` | `/api/purchases/:id/complete` | Acheter (`amount` ≤ plafond, `quantity?`, `paymentMethod?`) |
| `POST` | `/api/purchases/:id/cancel` | Retirer la demande (demandeur ou gérant) |

`pending → approved → completed`, ou `pending → rejected`, ou `→ cancelled`.
L'achat crée la dépense `stock_purchase` (− Caisse, + Stock) dans la même
transaction ; un produit demandé par son nom est créé à ce moment-là.

---

## §3 — Paramètres du restaurant

| Méthode | Route |
|---|---|
| `GET` | `/api/restaurant` |
| `PATCH` | `/api/restaurant` — `name`, `address`, `phone`, `logoMediaId`, `currencyCode`, `currencySymbol`, `currencyDecimals` |

La devise par défaut est le **franc guinéen** (`GNF`, symbole `FG`, `currencyDecimals: 0`).
Le GNF ne se divise pas en centimes : `currencyDecimals` indique à l'application
mobile d'afficher « 25 000 FG » et non « 25 000,00 FG ».

## Images

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/media` | Envoi `multipart/form-data`, champ `file` (JPEG/PNG/WebP, 3 Mo max) |
| `GET` | `/api/media/:id` | Lecture publique (utilisable directement dans `<Image source>`) |

Le type réel est vérifié à partir de la signature binaire du fichier, pas de
l'en-tête déclaré. Les images identiques sont dédupliquées.

---

## §4 — Personnel

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/staff` | Liste (`?search=&includeInactive=true&withoutAccount=true`), avec `account` si l'employé a un accès |
| `POST` | `/api/staff` | Créer une fiche |
| `GET` | `/api/staff/:id` | Fiche + solde salarial |
| `PATCH` | `/api/staff/:id` | Modifier |
| `DELETE` | `/api/staff/:id` | Supprimer (désactive si l'employé a un historique de paie) |
| `GET` | `/api/staff/attendances?from=&to=` | Feuille de présence |
| `POST` | `/api/staff/attendances` | Pointer toute l'équipe en une fois |
| `GET` | `/api/staff/:id/attendances?from=&to=` | Pointage d'un employé |
| `POST` | `/api/staff/:id/attendances` | Pointer (`{ "day": "2026-08-23", "status": "late", "arrivalTime": "09:40" }` — `present`, `late`, `absent`, `leave`) |
| `GET` | `/api/staff/:id/activity` | Historique : notes et pointages hors présence normale |
| `POST` | `/api/staff/:id/notes` | Noter (`kind`: `late`, `absence`, `warning`, `praise`, `note` ; `note` ; `occurredOn?`) |
| `GET` | `/api/staff/:id/salary` | Solde + historique des paiements |
| `POST` | `/api/staff/:id/salary/payments` | Payer (`{ "amount": 50000, "periodMonth": "2026-08" }`) |
| `POST` | `/api/staff/:id/salary/payments/:paymentId/cancel` | Annuler un paiement |
| `GET` | `/api/staff/salaries/overview` | Masse salariale et reste dû |

Un paiement de salaire débite la caisse **et** crée une dépense de catégorie
`salary`, visible dans le module Dépenses.

Le solde restant dû est calculé ainsi : `salaire mensuel × nombre de mois
écoulés depuis l'embauche − total déjà versé`.

---

## §5 — Menu

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/menu/categories` | Catégories |
| `POST` `PATCH` `DELETE` | `/api/menu/categories[/:id]` | Gérer les catégories |
| `GET` | `/api/menu/dishes` | Plats (`?categoryId=&search=&onlyAvailable=true`) |
| `POST` | `/api/menu/dishes` | Créer un plat |
| `GET` `PATCH` | `/api/menu/dishes/:id` | Détail / modification |
| `PATCH` | `/api/menu/dishes/:id/availability` | Basculer disponible / rupture |
| `DELETE` | `/api/menu/dishes/:id` | Retirer (archive si le plat a déjà été vendu) |

Quatre catégories (Entrées, Plats, Boissons, Desserts) sont créées
automatiquement à l'inscription.

---

## §6 — Stock

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/stock` | Produits + valeur totale du stock |
| `POST` | `/api/stock` | Créer un produit |
| `GET` `PATCH` `DELETE` | `/api/stock/:id` | Détail / modification / retrait |
| `POST` | `/api/stock/:id/adjustments` | Correction d'inventaire ou perte |
| `GET` | `/api/stock/:id/movements` | Journal du produit |
| `GET` | `/api/stock/alerts` | Produits sous le seuil |
| `GET` | `/api/stock/units` | Unités acceptées |

**L'achat d'un produit ne passe pas par ici** mais par une dépense de catégorie
`stock_purchase` (§9), pour que la caisse soit débitée en même temps.

---

## §7 — Caisse

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/cash/balance` | Solde actuel, total entrées, total sorties |
| `GET` | `/api/cash/movements` | Historique (`?direction=&category=&from=&to=&page=`) |
| `GET` | `/api/cash/breakdown?from=&to=` | Répartition des encaissements par mode de paiement |
| `POST` | `/api/cash/adjustments` | Correction manuelle (fonds de caisse, erreur) |

### Ouverture et clôture de caisse

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/cash/sessions/current` | Caisse ouverte, ou `null` |
| `POST` | `/api/cash/sessions/open` | Ouvrir (`openingFloat`, `breakdown?` : `{ "20000": 3 }`) |
| `POST` | `/api/cash/sessions/close` | Clôturer (`countedCash`, `breakdown?`, `countedMobileMoney?`, `note?`) |
| `GET` | `/api/cash/sessions` | Historique des clôtures (gérant) |
| `GET` | `/api/cash/sessions/:id` | Détail, avec le ticket Z (`summary`) |
| `POST` | `/api/cash/sessions/:id/correct` | Aligner le solde sur le compté (une seule fois) |

- Une seule caisse ouverte à la fois. Chaque mouvement écrit pendant qu'elle
  est ouverte lui est rattaché (`cash_movements.session_id`).
- **Attendu** = fond de caisse + mouvements de la session, par mode de paiement
  (un mouvement sans mode compte en espèces).
- **Comptage à l'aveugle** : sans le droit `cash.view`, la réponse ne contient
  ni attendu, ni écart, ni résumé. Un comptage faux sans `note` est refusé
  (`422`) sans indiquer l'écart.
- Le caissier ne peut ni vendre ni encaisser un remboursement tant que la
  caisse est fermée (`409`, `details.reason = "cash_session_closed"`) ; le
  gérant le peut.
- La correction d'un écart passe une écriture `adjustment` hors session.

## Rapports et exports (gérant)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/reports/summary?from=&to=` | Synthèse de la période (CA, dépenses, résultat, créances, plats vedettes, écarts) |
| `GET` | `/api/reports/export.xlsx?from=&to=` | Classeur Excel : Synthèse, Ventes, Dépenses, Caisse, Créances, Salaires, Clôtures |

Période d'un an au plus. Chaque export est inscrit au journal (`report.exported`).

---

## Mini-site et commandes en ligne

Chaque restaurant a sa propre adresse publique, `/r/<slug>` sur la version
web, ses zones de livraison, ses commandes et ses livreurs. Rien n'est
partagé entre restaurants.

### Pages publiques (sans compte)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/public/r/:slug` | Carte en ligne : restaurant, ouverture, zones, plats proposés |
| `POST` | `/api/public/r/:slug/orders` | Passer commande (8 par quart d'heure et par adresse IP) |
| `GET` | `/api/public/orders/:code` | Suivi de la commande par son code |
| `POST` | `/api/public/orders/:code/cancel` | Annulation par le client, tant qu'elle n'est pas acceptée |

- Le mini-site répond `404` si le restaurant n'est pas actif, si l'éditeur ne
  l'a pas autorisé ou s'il n'a pas d'adresse.
- Les prix et frais de livraison viennent toujours du serveur.
- Une livraison exige une zone active et un point de repère.
- Trois commandes en attente au plus par numéro de téléphone (`429` au-delà).

### Réglages (`/api/online`)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` / `PATCH` | `/settings` | Adresse, ouverture, livraison / retrait, horaires (heure de Conakry), message |
| `GET` / `POST` | `/zones` | Zones de livraison et leur prix |
| `PATCH` / `DELETE` | `/zones/:id` | Modifier, suspendre ou supprimer une zone |

Un plat porte `isOnline` : il n'apparaît sur le mini-site que s'il est coché.

### Commandes (`/api/orders`, droit `orders.manage`)

`pending` → `accepted` (portions réservées) → `ready` → `out_for_delivery` →
`delivered` (argent chez le livreur) → `completed` (vente créée, caisse
créditée). Ou `rejected` / `cancelled` (les portions reviennent au plat).

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/?group=active\|to_settle\|closed` | Commandes à traiter, à encaisser, closes (7 jours) |
| `GET` | `/drivers` | Livreurs : courses en cours et argent à reverser |
| `POST` | `/:id/accept`, `/:id/reject`, `/:id/ready`, `/:id/cancel` | Étapes de la commande |
| `POST` | `/:id/assign` | Confier à un livreur `{ driverId }` |
| `POST` | `/:id/complete` | L'argent est en caisse : crée la vente (caisse ouverte exigée pour le caissier) |

### Livreur (`/api/deliveries`, droit `deliveries.handle`)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/` | Ses courses et le montant à reverser |
| `POST` | `/:id/dispatch` | Il part avec la commande |
| `POST` | `/:id/deliver` | Livrée `{ collectedMethod: cash \| mobile_money }` |
| `POST` | `/:id/issue` | Problème : la commande revient au restaurant |

Le Super Admin autorise ou retire le mini-site d'un restaurant :
`POST /api/super-admin/restaurants/:id/online { allowed }`.

---

## Notifications sur le téléphone (Web Push)

Chaque notification de l'application part aussi en message sur les
appareils abonnés, application fermée. Les clés de signature sont créées au
premier démarrage et gardées en base (`platform_settings`) : rien à
configurer sur l'hébergement.

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/push/key` | Clé publique pour l'abonnement |
| `POST` | `/api/push/subscribe` | Abonner l'appareil au compte connecté `{ endpoint, keys }` |
| `POST` | `/api/push/unsubscribe` | Désabonner l'appareil `{ endpoint }` (déconnexion) |
| `POST` | `/api/public/orders/:code/push` | Le client suit sa commande sur son téléphone |

Le message part après validation de l'action. Un appareil désabonné (410)
est retiré au premier envoi refusé. Sur iPhone, seule l'application
installée sur l'écran d'accueil peut s'abonner (iOS 16.4 et plus).

---

## Service en salle : tables, additions, cuisine

Une table peut avoir **plusieurs additions** ouvertes (des clients qui ne
sont pas ensemble), chacune payée séparément. Une addition reçoit plusieurs
envois en cuisine ; les portions sont prises à l'envoi.

### Plan de salle (`/api/tables`)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/` | Tables actives, leur état (`free`, `occupied`, `cooking`, `ready`, `bill`) et leurs additions en cours |
| `POST` | `/`, `/batch` | Créer une table, ou « Table 1 » à « Table N » (`settings.manage`) |
| `PATCH` / `DELETE` | `/:id` | Modifier ; retirer (archivée si elle a déjà servi) |
| `GET` / `PATCH` | `/kitchen-settings` | Seuils d'attente en cuisine `{ warnMinutes, lateMinutes }` |
| `POST` | `/:id/bills` | Ouvrir une addition `{ label?, guests }` (`tables.serve`) |

### Additions (`/api/bills`)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/?status=active\|paid` | Additions à encaisser (demandées en tête), ou payées depuis 24 h |
| `GET` | `/:id` | Détail, plat par plat avec leur état |
| `POST` | `/:id/send` | Envoyer en cuisine `{ items: [{ dishId, quantity, note? }] }` |
| `POST` | `/:id/request` | Demander l'addition : le caissier est prévenu |
| `POST` | `/:id/pay` | Encaisser `{ paymentMethod, customerId? }` : crée la vente (caisse ouverte exigée pour le caissier) |
| `POST` | `/:id/cancel` | Annuler l'addition (`sales.cancel`, motif) |
| `POST` | `/items/:id/served` | Plat servi |
| `POST` | `/items/:id/cancel` | Annuler un plat envoyé (`sales.cancel`, motif) : la portion revient |

### Cuisine (`/api/kitchen`, droit `kitchen.handle`)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/` | Tickets à préparer et prêts depuis 30 min, sans prix |
| `POST` | `/tickets/:id/start` | Préparation commencée |
| `POST` | `/tickets/:id/ready` | Tout le ticket prêt, ou un plat avec `{ itemId }` |

Les commandes en ligne acceptées arrivent comme des tickets ; prêtes en
cuisine, elles passent « prêtes » côté caissier et livreur. Un ticket qui
dépasse `lateMinutes` prévient le gérant, une seule fois.

---

## §8 — Ventes, clients, créances

### Ventes

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/sales` | Liste + totaux (`?from=&to=&paymentMethod=&status=&customerId=`) |
| `POST` | `/api/sales` | Enregistrer une vente |
| `GET` | `/api/sales/:id` | Détail avec les lignes |
| `GET` | `/api/sales/:id/receipt` | Ticket (en-tête restaurant + lignes) |
| `POST` | `/api/sales/:id/cancel` | Annuler (contre-passe la caisse) |
| `GET` | `/api/sales/top-dishes?from=&to=` | Plats les plus vendus |

```json
POST /api/sales
{
  "items": [{ "dishId": "…", "quantity": 2 }],
  "paymentMethod": "cash",          // cash | mobile_money | card | credit
  "customerName": "M. Diallo",      // requis si paymentMethod = credit
  "customerPhone": "+224 622 00 00 00",
  "dueDate": "2026-09-30"           // facultatif
}
```

Le total est calculé par le serveur. `unitPrice` peut être fourni par ligne
pour appliquer une remise ponctuelle.

### Clients

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/customers` | Liste avec la dette de chacun (`?onlyDebtors=true`) |
| `POST` `GET` `PATCH` `DELETE` | `/api/customers[/:id]` | Gérer les fiches |

### Créances

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/credits` | Créances en cours + total dû |
| `GET` | `/api/credits/:id` | Détail + remboursements |
| `POST` | `/api/credits/:id/payments` | Rembourser (`{ "amount": 6000 }`) |
| `GET` | `/api/credits/summary` | Total dû, pour l'accueil |

Un remboursement supérieur au solde restant est refusé (422).

---

## §9 — Dépenses

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/expenses` | Liste + totaux par catégorie |
| `POST` | `/api/expenses` | Enregistrer |
| `GET` | `/api/expenses/:id` | Détail |
| `POST` | `/api/expenses/:id/cancel` | Annuler (contre-passe caisse et stock) |
| `GET` | `/api/expenses/categories` | Catégories acceptées |

```json
POST /api/expenses
{
  "amount": 20000,
  "category": "stock_purchase",   // stock_purchase | bill | maintenance | other
  "description": "Achat de 10 kg de poulet",
  "stockItemId": "…",             // requis si stock_purchase
  "quantity": 10                  // requis si stock_purchase
}
```

Le prix unitaire (`amount / quantity`) est calculé et reporté sur la fiche
produit. La catégorie `salary` n'est pas acceptée ici : un salaire se paie
depuis la fiche employé.

---

## §10 — Tableau de bord

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/dashboard/summary` | Caisse, ventes du jour et du mois, créances, stock, personnel, menu |
| `GET` | `/api/dashboard/trend?days=14` | Entrées / sorties par jour |

---

## Effets sur la caisse (§10)

| Action | Effet |
|---|---|
| Vente espèces / mobile money / carte | + Caisse |
| Vente à crédit | Créance ouverte, caisse inchangée |
| Remboursement de crédit | + Caisse, − Créance |
| Dépense — achat de stock | − Caisse, + Stock |
| Dépense — autre | − Caisse |
| Paiement de salaire | − Caisse, historique employé mis à jour |
| Annulation de vente ou de dépense | Mouvement inverse (l'original est conservé) |
