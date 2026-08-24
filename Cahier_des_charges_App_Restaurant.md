# Cahier des charges — Application de gestion de restaurant

**Technologie :** Expo SDK 54 (React Native) + Backend dans un conteneur Docker (API + PostgreSQL) + Déploiement sur Render

---

## 1. Présentation du projet

Application mobile permettant à un gérant de restaurant de piloter simplement son établissement : le menu (plats), le stock d'ingrédients, la caisse, les ventes (y compris à crédit), les dépenses et le personnel. Objectif : rester simple, efficace, et utilisable au quotidien sans complexité inutile.

---

## 2. Utilisateurs et accès

L'application est **multi-restaurant** : plusieurs restaurants peuvent utiliser la plateforme, chacun avec ses propres données totalement isolées.

Deux niveaux d'espace :

### a) Espace Super Admin
- Réservé à l'éditeur de l'application (toi).
- Voit la liste des restaurants inscrits.
- **Active ou désactive le compte d'un restaurant** (ex : après un paiement d'abonnement, vérification, etc.).
- Un restaurant désactivé ne peut plus se connecter à son espace tant qu'il n'est pas réactivé.

### b) Espace Restaurant (admin/gérant)
- Un seul type de compte pour l'instant à ce niveau : **admin/gérant**.
- Le premier utilisateur d'un restaurant crée l'espace (paramètres, logo, etc.), ce qui crée une demande de compte à activer par le Super Admin.
- Il peut inviter d'autres utilisateurs qui ont **exactement les mêmes droits** que lui au sein de son restaurant (pas de rôles limités pour cette version).
- Chaque restaurant est un espace isolé (un utilisateur ne voit que les données de son propre restaurant, jamais celles des autres).

---

## 3. Module — Paramètres du restaurant

- Nom du restaurant
- Logo (photo)
- Adresse
- Numéro de téléphone
- Ces informations sont réutilisées sur les tickets/reçus de vente.

---

## 4. Module — Personnel

Fiche par employé :
- Nom, poste, numéro de téléphone, date d'embauche
- **Présence / pointage** : marquer présent/absent par jour
- **Salaire** : montant du salaire, historique des paiements effectués, solde restant dû à l'employé

---

## 5. Module — Menu (plats vendus)

Fiche par plat :
- Nom du plat
- Photo
- Prix de vente
- Catégorie (entrée, plat, boisson, dessert...)
- Statut disponible / en rupture, **géré manuellement** (le gérant coche quand un plat n'est plus disponible)

> Le menu est **indépendant** du stock d'ingrédients : il n'y a pas de recette ni de déduction automatique d'ingrédients à chaque vente. Le lien entre les deux se fait uniquement au niveau de la caisse (l'achat d'ingrédients est une dépense, la vente d'un plat est une entrée).

---

## 6. Module — Stock (ingrédients / matières premières)

Fiche par produit en stock (ex : oignon, tomate, salade, poulet...) :
- Nom du produit
- Quantité en stock
- Unité (kg, pièce, litre...)
- Prix d'achat
- Seuil d'alerte (stock bas)

Règles :
- L'ajout ou l'achat d'un produit dans le stock est enregistré comme une **dépense** (voir module 8), qui augmente la quantité en stock et diminue la caisse.
- Le stock donne une valeur de référence (ce qui a été acheté, à quel prix) sans lien automatique avec les ventes de plats.

---

## 7. Module — Caisse

Le cœur de l'application. La caisse affiche en permanence le **solde actuel disponible**.

Deux types de mouvements :
- **Entrées d'argent** : chaque vente encaissée (y compris les remboursements de crédits)
- **Sorties d'argent** : chaque dépense enregistrée

Règles :
- Toute vente encaissée (hors crédit non payé) augmente automatiquement la caisse.
- Toute dépense enregistrée diminue automatiquement la caisse.
- Un remboursement de crédit client augmente la caisse au moment du paiement.
- Historique complet et consultable de tous les mouvements (date, type, montant, motif).

---

## 8. Module — Ventes

Pour chaque vente :
- Sélection des plats vendus + quantités → calcul automatique du total
- Choix du mode de paiement :
  - **Espèces**
  - **Mobile money**
  - **Carte**
  - **Crédit** (le client n'a pas encore payé)

### Cas particulier — Vente à crédit
- Enregistrement du client (nom, numéro de téléphone)
- Montant dû enregistré
- La vente n'alimente pas la caisse tant qu'elle n'est pas payée
- Quand le client rembourse (en une ou plusieurs fois) : chaque remboursement vient réduire sa dette et alimenter la caisse (entrée d'argent)
- Liste des créances en cours (qui doit combien) consultable à tout moment

---

## 9. Module — Dépenses

Chaque dépense doit contenir des informations détaillées pour rester bien tracée :
- Date
- Montant
- Catégorie (achat de stock/ingrédients, salaire, facture, entretien, autre)
- Motif / description
- Si liée à un achat de stock : produit concerné et quantité achetée

Règle :
- Toute dépense enregistrée déduit automatiquement le montant de la caisse.
- Si la dépense est un achat de stock, elle augmente aussi la quantité du produit concerné dans le module Stock.

---

## 10. Résumé des liens entre modules

| Action | Effet |
|---|---|
| Vente encaissée (espèces/mobile money/carte) | + Caisse |
| Vente à crédit | Créance enregistrée, pas d'effet sur la caisse |
| Remboursement de crédit | + Caisse, − Créance du client |
| Dépense (achat de stock) | − Caisse, + Stock du produit |
| Dépense (autre : salaire, facture...) | − Caisse |
| Paiement de salaire à un employé | − Caisse, mis à jour dans le module Personnel |

---

## 11. Non-fonctionnel

- Interface simple, pensée pour un usage rapide au quotidien (prise de commande, encaissement)
- Design soigné à travailler une fois le backend terminé et stabilisé
- Application mobile Expo SDK 54

---

## 12. Backend et déploiement

- **Backend** : API packagée dans un **conteneur Docker**, base de données **PostgreSQL**
- **Déploiement** : hébergé sur **Render**
- Architecture pensée multi-restaurant dès le départ (isolation des données par restaurant, via un identifiant restaurant sur chaque table)
- Ordre de travail : backend (API + base de données + logique métier) d'abord, jusqu'à ce qu'il soit complet et fonctionnel, puis design de l'interface ensuite
