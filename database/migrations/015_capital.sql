-- =============================================================
-- 015 — Apport de capital en caisse
-- Cahier des charges §7 (« le cœur de l'application »)
--
-- Le gérant met souvent de l'argent personnel dans la caisse pour
-- démarrer la journée ou couvrir un achat. Cette entrée n'est ni une
-- vente, ni le remboursement d'une créance, ni la correction d'une
-- erreur de saisie : elle mérite sa propre catégorie, sans quoi le
-- chiffre d'affaires du tableau de bord serait gonflé par de l'argent
-- qui ne vient pas des clients.
-- =============================================================

ALTER TABLE cash_movements DROP CONSTRAINT cash_movements_category_check;

ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_category_check
  CHECK (category IN (
    'sale',            -- vente encaissée (§8)
    'credit_payment',  -- remboursement d'une créance (§8)
    'expense',         -- dépense (§9)
    'salary',          -- paiement de salaire (§4)
    'adjustment',      -- correction d'une erreur de saisie
    'capital'          -- apport du gérant / retrait personnel
  ));

COMMENT ON COLUMN cash_movements.category IS
  'Nature du mouvement. « capital » distingue l''argent apporté par le '
  'gérant des recettes tirées de l''activité (§7, §10).';
