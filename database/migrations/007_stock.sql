-- =============================================================
-- 007 — Stock : ingrédients / matières premières
-- Cahier des charges §6
-- =============================================================

CREATE TABLE stock_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,

  name                text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  unit                text        NOT NULL CHECK (unit IN (
                        'kg', 'g', 'l', 'ml', 'piece', 'sachet', 'carton',
                        'bouteille', 'casier', 'sac'
                      )),
  quantity            numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),

  -- Dernier prix d'achat unitaire connu, mis à jour à chaque achat (§6).
  purchase_price      numeric(14, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  alert_threshold     numeric(14, 3) NOT NULL DEFAULT 0 CHECK (alert_threshold >= 0),

  is_archived         boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stock_items_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_stock_items_restaurant ON stock_items (restaurant_id) WHERE NOT is_archived;
CREATE UNIQUE INDEX uq_stock_items_name
  ON stock_items (restaurant_id, lower(btrim(name))) WHERE NOT is_archived;

-- Vue partielle pratique : produits sous le seuil d'alerte (§6).
CREATE INDEX idx_stock_items_low
  ON stock_items (restaurant_id)
  WHERE NOT is_archived AND quantity <= alert_threshold;

CREATE TRIGGER trg_stock_items_updated_at
  BEFORE UPDATE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Historique des mouvements de stock (traçabilité).
-- Une entrée provient d'un achat (= dépense, §9) ou d'un ajustement manuel.
-- -------------------------------------------------------------
CREATE TABLE stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  stock_item_id   uuid        NOT NULL,

  direction       text        NOT NULL CHECK (direction IN ('in', 'out')),
  quantity        numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit_price      numeric(14, 2) CHECK (unit_price >= 0),

  reason          text        NOT NULL CHECK (reason IN (
                    'purchase',    -- achat enregistré comme dépense
                    'initial',     -- stock initial à la création du produit
                    'adjustment',  -- correction d'inventaire
                    'loss'         -- perte / casse / péremption
                  )),
  source_type     text        CHECK (source_type IN ('expense', 'manual')),
  source_id       uuid,

  quantity_after  numeric(14, 3) NOT NULL,
  note            text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stock_movements_item_fk
    FOREIGN KEY (stock_item_id, restaurant_id)
    REFERENCES stock_items (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT stock_movements_created_by_fk
    FOREIGN KEY (created_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL
);

CREATE INDEX idx_stock_movements_item
  ON stock_movements (restaurant_id, stock_item_id, occurred_at DESC);
CREATE INDEX idx_stock_movements_source
  ON stock_movements (restaurant_id, source_type, source_id);

COMMENT ON TABLE stock_movements IS
  'Journal du stock. Le stock ne se décrémente jamais automatiquement lors '
  'd''une vente : le menu est indépendant du stock (§5, §6).';
