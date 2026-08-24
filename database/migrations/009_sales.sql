-- =============================================================
-- 009 — Clients, ventes et lignes de vente
-- Cahier des charges §8
-- =============================================================

CREATE TABLE customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  full_name      text        NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  phone          text,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customers_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_customers_restaurant ON customers (restaurant_id);
-- Le téléphone identifie le client à crédit (§8).
CREATE UNIQUE INDEX uq_customers_phone
  ON customers (restaurant_id, phone) WHERE phone IS NOT NULL;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Ventes
-- -------------------------------------------------------------
CREATE TABLE sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  reference       text        NOT NULL,                  -- ticket : V-20260823-0001

  total_amount    numeric(14, 2) NOT NULL CHECK (total_amount >= 0),

  payment_method  text        NOT NULL CHECK (payment_method IN (
                    'cash', 'mobile_money', 'card', 'credit'
                  )),

  -- 'paid'      : encaissée, la caisse a été créditée
  -- 'credit'    : vente à crédit, créance ouverte, caisse non impactée
  -- 'cancelled' : annulée (mouvement de caisse contre-passé)
  status          text        NOT NULL CHECK (status IN ('paid', 'credit', 'cancelled')),

  customer_id     uuid,                                   -- obligatoire si crédit
  note            text,
  sold_at         timestamptz NOT NULL DEFAULT now(),
  cancelled_at    timestamptz,
  cancel_reason   text,

  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sales_customer_fk
    FOREIGN KEY (customer_id, restaurant_id)
    REFERENCES customers (id, restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT sales_created_by_fk
    FOREIGN KEY (created_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL,

  -- Cohérence mode de paiement / statut / client (§8).
  CONSTRAINT sales_credit_requires_customer
    CHECK (payment_method <> 'credit' OR customer_id IS NOT NULL),
  CONSTRAINT sales_credit_status
    CHECK (
      (payment_method = 'credit' AND status IN ('credit', 'cancelled'))
      OR (payment_method <> 'credit' AND status IN ('paid', 'cancelled'))
    ),

  CONSTRAINT sales_reference_key UNIQUE (restaurant_id, reference),
  CONSTRAINT sales_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_sales_restaurant_date ON sales (restaurant_id, sold_at DESC);
CREATE INDEX idx_sales_customer ON sales (restaurant_id, customer_id);
CREATE INDEX idx_sales_status ON sales (restaurant_id, status);

CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Lignes de vente — le nom et le prix du plat sont figés (snapshot)
-- pour que les tickets passés restent exacts après modification du menu.
-- -------------------------------------------------------------
CREATE TABLE sale_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  sale_id        uuid        NOT NULL,
  dish_id        uuid,

  dish_name      text        NOT NULL,
  unit_price     numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  quantity       numeric(10, 2) NOT NULL CHECK (quantity > 0),
  line_total     numeric(14, 2) NOT NULL CHECK (line_total >= 0),

  CONSTRAINT sale_items_sale_fk
    FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES sales (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT sale_items_dish_fk
    FOREIGN KEY (dish_id, restaurant_id)
    REFERENCES dishes (id, restaurant_id) ON DELETE SET NULL
);

CREATE INDEX idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX idx_sale_items_dish ON sale_items (restaurant_id, dish_id);
