# Base de données

PostgreSQL 17. Chaque fichier de `migrations/` correspond à un domaine du cahier
des charges et est appliqué une seule fois, dans l'ordre alphabétique, par le
script `backend/src/db/migrate.ts`.

## Fichiers

| Fichier | Contenu | Cahier des charges |
|---|---|---|
| `001_extensions.sql` | Extensions, `set_updated_at()`, génération des références de documents | — |
| `002_super_admins.sql` | Comptes de l'éditeur | §2.a |
| `003_restaurants.sql` | Restaurants (tenant racine), stockage des images | §2, §3 |
| `004_users.sql` | Utilisateurs, invitations, sessions | §2.b |
| `005_cash.sql` | Grand livre de caisse + solde matérialisé | §7 |
| `006_menu.sql` | Catégories et plats | §5 |
| `007_stock.sql` | Produits en stock et journal des mouvements | §6 |
| `008_staff.sql` | Employés et pointage | §4 |
| `009_sales.sql` | Clients, ventes, lignes de vente | §8 |
| `010_credits.sql` | Créances et remboursements | §8 |
| `011_expenses.sql` | Dépenses | §9 |
| `012_salary_payments.sql` | Paiements de salaire | §4, §10 |
| `013_views.sql` | Vues de lecture (créances, salaires, stock bas, caisse quotidienne) | §10 |
| `014_currency_gnf.sql` | Devise par défaut : franc guinéen, sans centimes | §3 |

## Règles appliquées par la base elle-même

Ces garanties ne dépendent pas du code applicatif : même une requête SQL
directe ne peut pas les contourner.

**Isolation multi-restaurant.** Chaque table porte un `restaurant_id`. Les
tables filles ne référencent pas seulement l'identifiant du parent mais le
couple `(id, restaurant_id)`, via des clés étrangères composites appuyées sur
des contraintes `UNIQUE (id, restaurant_id)`. Rattacher un plat du restaurant A
à une vente du restaurant B est rejeté par PostgreSQL.

**Solde de caisse toujours juste.** `cash_balances` est mis à jour par le
trigger `apply_cash_movement_to_balance` à chaque écriture dans
`cash_movements`. Le solde ne peut pas diverger du grand livre, et sa lecture
reste en O(1) pour l'application mobile.

**Créances cohérentes.** `credits.amount_left` est une colonne générée
(`amount_due - amount_paid`), et le trigger `refresh_credit_from_payments`
recalcule `amount_paid` et le statut à partir de la table des remboursements.
Une créance ne peut pas être marquée « payée » sans remboursement réel, et
`credits_not_overpaid` interdit de rembourser plus que le montant dû.

**Cohérence des dépenses.** `expenses_stock_purchase_shape` impose qu'un achat
de stock renseigne le produit et la quantité, et qu'une dépense d'une autre
catégorie ne les renseigne pas.

**Cohérence des ventes.** `sales_credit_requires_customer` impose un client sur
toute vente à crédit ; `sales_credit_status` interdit qu'une vente à crédit soit
marquée `paid` (elle passe par une créance).

**Stock jamais négatif.** `stock_items.quantity >= 0`, et le service verrouille
la ligne (`SELECT ... FOR UPDATE`) avant de la modifier pour sérialiser deux
achats simultanés du même produit.

## Historique préservé

Rien n'est effacé :

- une ligne de vente fige le nom et le prix du plat (`sale_items.dish_name`,
  `unit_price`), pour que les tickets passés restent exacts après une
  modification du menu ;
- un plat ou un produit déjà utilisé est archivé (`is_archived`), pas supprimé ;
- l'annulation d'une vente ou d'une dépense écrit un mouvement de caisse
  inverse, elle n'efface jamais l'écriture d'origine.

## Inspecter la base

```bash
docker compose exec db psql -U restaurant -d restaurant

\dt              -- tables
\dv              -- vues
\d+ cash_movements
SELECT * FROM schema_migrations ORDER BY filename;
```
