-- =============================================================
-- 004 — Utilisateurs d'un restaurant, invitations, sessions
-- Cahier des charges §2.b
-- Tous les utilisateurs d'un restaurant ont exactement les mêmes droits.
-- =============================================================

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  email          citext      NOT NULL UNIQUE,
  password_hash  text        NOT NULL,
  full_name      text        NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  phone          text,
  is_owner       boolean     NOT NULL DEFAULT false,  -- créateur de l'espace
  is_active      boolean     NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Référencé par les tables filles pour verrouiller l'isolation multi-tenant.
  CONSTRAINT users_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_users_restaurant ON users (restaurant_id);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Un seul propriétaire (créateur) par restaurant.
CREATE UNIQUE INDEX uq_users_one_owner_per_restaurant
  ON users (restaurant_id) WHERE is_owner;

-- -------------------------------------------------------------
-- Invitations : le gérant invite des collègues aux mêmes droits.
-- -------------------------------------------------------------
CREATE TABLE user_invitations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  email          citext      NOT NULL,
  token_hash     text        NOT NULL UNIQUE,
  invited_by     uuid        REFERENCES users (id) ON DELETE SET NULL,
  expires_at     timestamptz NOT NULL,
  accepted_at    timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_invitations_restaurant ON user_invitations (restaurant_id);
CREATE UNIQUE INDEX uq_user_invitations_pending
  ON user_invitations (restaurant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- -------------------------------------------------------------
-- Sessions (refresh tokens) — application mobile.
-- -------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type   text        NOT NULL CHECK (subject_type IN ('user', 'super_admin')),
  subject_id     uuid        NOT NULL,
  token_hash     text        NOT NULL UNIQUE,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_subject ON refresh_tokens (subject_type, subject_id);
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens (expires_at);
