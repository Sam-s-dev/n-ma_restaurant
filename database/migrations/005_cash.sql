-- =============================================================
-- 005 — Caisse : le grand livre des mouvements + solde temps réel
-- Cahier des charges §7 (« le cœur de l'application »)
-- =============================================================

-- Grand livre en écriture seule (append-only) : toute entrée / sortie
-- d'argent du restaurant passe obligatoirement par cette table.
CREATE TABLE cash_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,

  direction      text        NOT NULL CHECK (direction IN ('in', 'out')),
  amount         numeric(14, 2) NOT NULL CHECK (amount > 0),

  -- Motif normalisé, pour les filtres et les statistiques.
  category       text        NOT NULL CHECK (category IN (
                   'sale',            -- vente encaissée (§8)
                   'credit_payment',  -- remboursement d'une créance (§8)
                   'expense',         -- dépense (§9)
                   'salary',          -- paiement de salaire (§4)
                   'adjustment'       -- correction manuelle de caisse
                 )),

  -- Lien polymorphe vers le document source (sale, expense, ...).
  -- Pas de FK : le grand livre reste indépendant du cycle de vie des sources.
  source_type    text        CHECK (source_type IN (
                   'sale', 'credit_payment', 'expense', 'salary_payment', 'manual'
                 )),
  source_id      uuid,

  payment_method text        CHECK (payment_method IN (
                   'cash', 'mobile_money', 'card', 'bank_transfer'
                 )),

  label          text        NOT NULL,             -- motif lisible (§7)
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,                             -- users.id (nullable si système)
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cash_movements_created_by_fk
    FOREIGN KEY (created_by, restaurant_id) REFERENCES users (id, restaurant_id)
    ON DELETE SET NULL
);

CREATE INDEX idx_cash_movements_restaurant_date
  ON cash_movements (restaurant_id, occurred_at DESC);
CREATE INDEX idx_cash_movements_source
  ON cash_movements (restaurant_id, source_type, source_id);
CREATE INDEX idx_cash_movements_category
  ON cash_movements (restaurant_id, category, occurred_at DESC);

-- -------------------------------------------------------------
-- Solde de caisse matérialisé : lecture en O(1) depuis le mobile.
-- -------------------------------------------------------------
CREATE TABLE cash_balances (
  restaurant_id  uuid PRIMARY KEY REFERENCES restaurants (id) ON DELETE CASCADE,
  balance        numeric(14, 2) NOT NULL DEFAULT 0,
  total_in       numeric(14, 2) NOT NULL DEFAULT 0,
  total_out      numeric(14, 2) NOT NULL DEFAULT 0,
  updated_at     timestamptz    NOT NULL DEFAULT now()
);

-- Chaque restaurant créé obtient immédiatement sa ligne de solde à 0.
CREATE OR REPLACE FUNCTION create_cash_balance_for_restaurant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO cash_balances (restaurant_id) VALUES (NEW.id)
  ON CONFLICT (restaurant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restaurants_create_cash_balance
  AFTER INSERT ON restaurants
  FOR EACH ROW EXECUTE FUNCTION create_cash_balance_for_restaurant();

-- Le solde est recalculé de façon incrémentale par trigger : impossible
-- qu'un mouvement soit enregistré sans impacter la caisse (§7).
CREATE OR REPLACE FUNCTION apply_cash_movement_to_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_restaurant uuid;
  v_delta_in   numeric(14, 2) := 0;
  v_delta_out  numeric(14, 2) := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_restaurant := OLD.restaurant_id;
  ELSE
    v_restaurant := NEW.restaurant_id;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.direction = 'in' THEN
      v_delta_in := v_delta_in - OLD.amount;
    ELSE
      v_delta_out := v_delta_out - OLD.amount;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.direction = 'in' THEN
      v_delta_in := v_delta_in + NEW.amount;
    ELSE
      v_delta_out := v_delta_out + NEW.amount;
    END IF;
  END IF;

  INSERT INTO cash_balances (restaurant_id, balance, total_in, total_out, updated_at)
  VALUES (v_restaurant, v_delta_in - v_delta_out, v_delta_in, v_delta_out, now())
  ON CONFLICT (restaurant_id) DO UPDATE
    SET total_in   = cash_balances.total_in  + EXCLUDED.total_in,
        total_out  = cash_balances.total_out + EXCLUDED.total_out,
        balance    = cash_balances.balance   + EXCLUDED.balance,
        updated_at = now();

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_cash_movements_balance
  AFTER INSERT OR UPDATE OR DELETE ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION apply_cash_movement_to_balance();

COMMENT ON TABLE cash_movements IS
  'Grand livre de caisse. Une vente encaissée crée une entrée, une dépense '
  'crée une sortie, un remboursement de crédit crée une entrée (§7, §10).';
