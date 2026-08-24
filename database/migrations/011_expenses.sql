-- =============================================================
-- 011 — Dépenses
-- Cahier des charges §9
-- Toute dépense diminue la caisse ; si c'est un achat de stock,
-- elle augmente aussi la quantité du produit concerné.
-- =============================================================

CREATE TABLE expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  reference       text        NOT NULL,                   -- D-20260823-0001

  amount          numeric(14, 2) NOT NULL CHECK (amount > 0),
  category        text        NOT NULL CHECK (category IN (
                    'stock_purchase',  -- achat de stock / ingrédients
                    'salary',          -- salaire
                    'bill',            -- facture (eau, électricité...)
                    'maintenance',     -- entretien
                    'other'            -- autre
                  )),
  description     text        NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  expense_date    date        NOT NULL DEFAULT CURRENT_DATE,

  -- Renseignés uniquement si category = 'stock_purchase' (§9).
  stock_item_id   uuid,
  quantity        numeric(14, 3) CHECK (quantity IS NULL OR quantity > 0),
  unit_price      numeric(14, 2) CHECK (unit_price IS NULL OR unit_price >= 0),

  -- Renseigné uniquement si category = 'salary'.
  employee_id     uuid,

  payment_method  text        NOT NULL DEFAULT 'cash'
                              CHECK (payment_method IN ('cash', 'mobile_money', 'card', 'bank_transfer')),

  cancelled_at    timestamptz,
  cancel_reason   text,

  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expenses_stock_item_fk
    FOREIGN KEY (stock_item_id, restaurant_id)
    REFERENCES stock_items (id, restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT expenses_employee_fk
    FOREIGN KEY (employee_id, restaurant_id)
    REFERENCES employees (id, restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT expenses_created_by_fk
    FOREIGN KEY (created_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL,

  -- Un achat de stock exige produit + quantité ; les autres catégories non.
  CONSTRAINT expenses_stock_purchase_shape CHECK (
    (category = 'stock_purchase' AND stock_item_id IS NOT NULL AND quantity IS NOT NULL)
    OR (category <> 'stock_purchase' AND stock_item_id IS NULL AND quantity IS NULL)
  ),
  CONSTRAINT expenses_salary_shape CHECK (
    category = 'salary' OR employee_id IS NULL
  ),

  CONSTRAINT expenses_reference_key UNIQUE (restaurant_id, reference),
  CONSTRAINT expenses_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_expenses_restaurant_date ON expenses (restaurant_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses (restaurant_id, category, expense_date DESC);
CREATE INDEX idx_expenses_stock_item ON expenses (restaurant_id, stock_item_id);
CREATE INDEX idx_expenses_employee ON expenses (restaurant_id, employee_id);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE expenses IS
  'Dépenses détaillées (§9). Le débit de caisse et l''entrée en stock '
  'associés sont créés dans la même transaction par le service métier.';
