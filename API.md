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
| `POST` | `/api/users` | Créer un compte (`fullName`, `email`, `password`, `phone?`, `role`) |
| `PATCH` | `/api/users/:id` | Renommer / activer / désactiver / changer de rôle |
| `DELETE` | `/api/users/:id` | Retirer de l'équipe (désactive si le compte a saisi des écritures) |
| `POST` | `/api/users/invitations` | Inviter (`{ "email": "…", "role": "cashier" }`) — renvoie le `token` **une seule fois** |
| `GET` | `/api/users/invitations/list` | Invitations en attente |
| `DELETE` | `/api/users/invitations/:id` | Révoquer une invitation |

### Rôles

Chaque compte a un rôle : `manager` (gérant), `cashier` (caissier) ou
`storekeeper` (magasinier). Les droits sont fixes par rôle et définis dans
[backend/src/core/permissions.ts](backend/src/core/permissions.ts). Le profil
renvoyé par `/api/auth/login` et `/api/auth/me` contient `user.role` et
`user.permissions`. L'application mobile s'en sert pour masquer ce qui serait
refusé, mais c'est le serveur qui contrôle : toute action interdite répond `403`.

| | Gérant | Caissier | Magasinier |
|---|:-:|:-:|:-:|
| Encaisser, imprimer un ticket | ✅ | ✅ (ses propres ventes seulement) | — |
| Annuler une vente, prix libre, vente antidatée | ✅ | — | — |
| Clients (sauf suppression), créances, remboursements | ✅ | ✅ | — |
| Consulter le menu, marquer un plat disponible ou épuisé | ✅ | ✅ | — |
| Créer ou modifier un plat, gérer les catégories | ✅ | — | — |
| Stock : consulter, corriger, déclarer une perte | ✅ | — | ✅ |
| Dépenses : achat de stock | ✅ | — | ✅ (ne voit que les achats) |
| Autres dépenses, annulation de dépense | ✅ | — | — |
| Caisse, tableau de bord, plats vedettes | ✅ | — | — |
| Personnel et salaires, équipe, paramètres, journal | ✅ | — | — |

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
| `GET` | `/api/staff` | Liste (`?search=&includeInactive=true`) |
| `POST` | `/api/staff` | Créer une fiche |
| `GET` | `/api/staff/:id` | Fiche + solde salarial |
| `PATCH` | `/api/staff/:id` | Modifier |
| `DELETE` | `/api/staff/:id` | Supprimer (désactive si l'employé a un historique de paie) |
| `GET` | `/api/staff/attendances?from=&to=` | Feuille de présence |
| `POST` | `/api/staff/attendances` | Pointer toute l'équipe en une fois |
| `GET` | `/api/staff/:id/attendances?from=&to=` | Pointage d'un employé |
| `POST` | `/api/staff/:id/attendances` | Pointer (`{ "day": "2026-08-23", "status": "present" }`) |
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
