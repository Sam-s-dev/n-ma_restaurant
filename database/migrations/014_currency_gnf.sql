-- =============================================================
-- 014 — Devise par défaut : franc guinéen (GNF)
--
-- Le GNF ne se divise pas en centimes et manipule de grands nombres
-- (un plat coûte couramment 25 000 GNF). On ajoute donc le nombre de
-- décimales à afficher, pour que l'application mobile écrive
-- « 25 000 FG » et non « 25 000,00 FG ».
-- =============================================================

ALTER TABLE restaurants
  ADD COLUMN currency_decimals smallint NOT NULL DEFAULT 0
    CHECK (currency_decimals BETWEEN 0 AND 3);

COMMENT ON COLUMN restaurants.currency_decimals IS
  'Décimales à afficher : 0 pour le GNF, 2 pour l''euro ou le dollar.';

-- Nouvelle valeur par défaut pour les prochaines inscriptions.
ALTER TABLE restaurants ALTER COLUMN currency_code   SET DEFAULT 'GNF';
ALTER TABLE restaurants ALTER COLUMN currency_symbol SET DEFAULT 'FG';

-- Les restaurants déjà inscrits avec l'ancienne valeur par défaut
-- basculent en GNF ; ceux qui ont choisi une autre devise sont laissés
-- tels quels.
UPDATE restaurants
   SET currency_code = 'GNF',
       currency_symbol = 'FG',
       currency_decimals = 0
 WHERE currency_code = 'XOF';
