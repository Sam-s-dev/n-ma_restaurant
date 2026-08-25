-- =============================================================
-- 016 — Quantité disponible par plat
-- Cahier des charges §5 (« statut disponible / en rupture »)
--
-- Le gérant prépare un nombre de portions donné le matin. Chaque vente
-- en retire une ; à zéro, le plat sort automatiquement de la carte et
-- n'est plus vendable tant que la quantité n'a pas été remise à jour
-- depuis le menu.
--
-- La colonne est nullable à dessein : NULL signifie « non compté »,
-- pour les plats préparés à la commande dont le stock n'a pas de sens.
-- Les plats créés avant cette migration restent donc vendables.
-- =============================================================

ALTER TABLE dishes
  ADD COLUMN available_quantity integer
    CHECK (available_quantity IS NULL OR available_quantity >= 0);

COMMENT ON COLUMN dishes.available_quantity IS
  'Portions restantes. NULL = quantité non suivie (préparé à la commande). '
  'À 0, le plat est automatiquement marqué indisponible (§5, §8).';

-- Retrouver les plats comptés bientôt épuisés, pour l''alerte du menu.
CREATE INDEX idx_dishes_available_quantity
  ON dishes (restaurant_id, available_quantity)
  WHERE available_quantity IS NOT NULL AND NOT is_archived;
