-- =============================================================
-- 006 — Menu : catégories et plats vendus
-- Cahier des charges §5
-- Le menu est indépendant du stock : aucune recette, aucune déduction
-- automatique d'ingrédients.
-- =============================================================

CREATE TABLE menu_categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  name           text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  position       integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT menu_categories_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE UNIQUE INDEX uq_menu_categories_name
  ON menu_categories (restaurant_id, lower(btrim(name)));

CREATE TRIGGER trg_menu_categories_updated_at
  BEFORE UPDATE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE dishes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  category_id    uuid,
  name           text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description    text,
  photo_media_id uuid        REFERENCES media (id) ON DELETE SET NULL,
  price          numeric(14, 2) NOT NULL CHECK (price >= 0),

  -- §5 : disponibilité gérée manuellement par le gérant.
  is_available   boolean     NOT NULL DEFAULT true,
  is_archived    boolean     NOT NULL DEFAULT false,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- FK composite : une catégorie d'un autre restaurant est rejetée par la base.
  CONSTRAINT dishes_category_fk
    FOREIGN KEY (category_id, restaurant_id)
    REFERENCES menu_categories (id, restaurant_id) ON DELETE SET NULL,
  CONSTRAINT dishes_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_dishes_restaurant ON dishes (restaurant_id) WHERE NOT is_archived;
CREATE INDEX idx_dishes_category ON dishes (restaurant_id, category_id);
CREATE UNIQUE INDEX uq_dishes_name
  ON dishes (restaurant_id, lower(btrim(name))) WHERE NOT is_archived;

CREATE TRIGGER trg_dishes_updated_at
  BEFORE UPDATE ON dishes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN dishes.is_available IS
  'Statut disponible / en rupture, coché manuellement par le gérant (§5).';
