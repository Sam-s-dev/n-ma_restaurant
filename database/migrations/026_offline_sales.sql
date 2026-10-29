-- =============================================================
-- 026 — Ventes faites hors connexion
--
-- Quand internet coupe, le téléphone enregistre la vente chez lui et
-- l'envoie au retour de la connexion. Chaque vente porte un identifiant
-- créé par le téléphone : si le réseau la fait partir deux fois, le
-- serveur la reconnaît et ne la compte qu'une fois.
-- =============================================================

ALTER TABLE sales
  ADD COLUMN client_id uuid,
  ADD COLUMN recorded_offline boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX uq_sales_client_id
  ON sales (restaurant_id, client_id) WHERE client_id IS NOT NULL;

COMMENT ON COLUMN sales.client_id IS
  'Identifiant donné par le téléphone : une vente renvoyée après une coupure '
  'de réseau est reconnue au lieu d''être comptée deux fois.';
