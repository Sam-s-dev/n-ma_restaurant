-- =============================================================
-- 002 — Espace Super Admin (éditeur de l'application)
-- Cahier des charges §2.a
-- =============================================================

CREATE TABLE super_admins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext      NOT NULL UNIQUE,
  password_hash  text        NOT NULL,
  full_name      text        NOT NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT super_admins_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE TRIGGER trg_super_admins_updated_at
  BEFORE UPDATE ON super_admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE super_admins IS
  'Comptes de la plateforme. Ne sont rattachés à aucun restaurant.';
