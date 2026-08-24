-- =============================================================
-- 003 — Restaurants (tenant racine) + médias
-- Cahier des charges §2, §3, §12 (isolation multi-restaurant)
-- =============================================================

-- Stockage des images (logo restaurant, photo de plat) directement en base.
-- Choix volontaire : Render a un système de fichiers éphémère, et cela évite
-- une dépendance à un stockage objet externe pour cette version.
CREATE TABLE media (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid,                       -- NULL = média de plateforme
  mime_type      text        NOT NULL,
  byte_size      integer     NOT NULL CHECK (byte_size > 0),
  checksum       text        NOT NULL,
  content        bytea       NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT media_mime_allowed
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE TABLE restaurants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- §3 Paramètres du restaurant (repris sur les tickets de vente)
  name           text        NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  logo_media_id  uuid        REFERENCES media (id) ON DELETE SET NULL,
  address        text,
  phone          text,

  -- Paramètres d'affichage monétaire
  currency_code  text        NOT NULL DEFAULT 'XOF' CHECK (length(currency_code) = 3),
  currency_symbol text       NOT NULL DEFAULT 'FCFA',

  -- §2.a cycle de vie du compte piloté par le Super Admin
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'active', 'disabled')),
  status_reason  text,
  activated_at   timestamptz,
  disabled_at    timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_restaurants_status ON restaurants (status);
CREATE INDEX idx_restaurants_created_at ON restaurants (created_at DESC);

CREATE TRIGGER trg_restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE media
  ADD CONSTRAINT media_restaurant_fk
  FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE;

CREATE INDEX idx_media_restaurant ON media (restaurant_id);

COMMENT ON COLUMN restaurants.status IS
  'pending = inscription en attente de validation Super Admin ; '
  'active = peut se connecter ; disabled = connexion bloquée (§2.a).';
