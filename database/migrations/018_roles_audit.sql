-- =============================================================
-- 018 — Rôles et journal d'activité
--
-- Jusqu'ici tous les comptes d'un restaurant avaient les mêmes droits :
-- le caissier pouvait annuler une vente, vider la caisse en « correction »
-- ou changer un prix sans que personne le sache. Chaque compte porte
-- désormais un rôle, et les actions sensibles laissent une trace.
--
-- Les droits de chaque rôle sont définis dans le code
-- (backend/src/core/permissions.ts) : la base ne garde que le rôle.
-- =============================================================

ALTER TABLE users
  ADD COLUMN role text NOT NULL DEFAULT 'manager'
    CONSTRAINT users_role_allowed CHECK (role IN ('manager', 'cashier', 'storekeeper'));

-- Tous les comptes existants restent gérants : aucun restaurant déjà
-- inscrit ne perd un droit. Le défaut ne sert qu'à cette reprise ; le code
-- indique toujours le rôle explicitement à la création.
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- Le créateur de l'espace est gérant, et le reste.
ALTER TABLE users
  ADD CONSTRAINT users_owner_is_manager CHECK (NOT is_owner OR role = 'manager');

ALTER TABLE user_invitations
  ADD COLUMN role text NOT NULL DEFAULT 'cashier'
    CONSTRAINT user_invitations_role_allowed CHECK (role IN ('manager', 'cashier', 'storekeeper'));

-- -------------------------------------------------------------
-- Journal d'activité : qui a fait quoi, quand.
--
-- On écrit, on ne modifie jamais. L'auteur est conservé par son nom en
-- plus de son identifiant : un compte retiré de l'équipe ne doit pas
-- rendre ses actions anonymes.
-- -------------------------------------------------------------
CREATE TABLE audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  user_id        uuid        REFERENCES users (id) ON DELETE SET NULL,
  user_name      text        NOT NULL,
  user_role      text        NOT NULL,
  action         text        NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_id      uuid,
  details        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_restaurant_date ON audit_log (restaurant_id, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log (user_id);

COMMENT ON TABLE audit_log IS
  'Journal des actions sensibles, en écriture seule, consultable par le gérant.';
