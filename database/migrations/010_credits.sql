-- =============================================================
-- 010 — Créances (ventes à crédit) et remboursements
-- Cahier des charges §8 « Cas particulier — Vente à crédit »
-- =============================================================

CREATE TABLE credits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  sale_id        uuid        NOT NULL,
  customer_id    uuid        NOT NULL,

  amount_due     numeric(14, 2) NOT NULL CHECK (amount_due > 0),
  amount_paid    numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  -- Colonne générée : le solde restant est toujours cohérent.
  amount_left    numeric(14, 2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,

  status         text        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'partially_paid', 'paid', 'cancelled')),
  due_date       date,
  opened_at      timestamptz NOT NULL DEFAULT now(),
  settled_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credits_not_overpaid CHECK (amount_paid <= amount_due),
  CONSTRAINT credits_sale_fk
    FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES sales (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT credits_customer_fk
    FOREIGN KEY (customer_id, restaurant_id)
    REFERENCES customers (id, restaurant_id) ON DELETE RESTRICT,
  -- Une vente à crédit = une seule créance.
  CONSTRAINT credits_sale_unique UNIQUE (sale_id),
  CONSTRAINT credits_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_credits_customer ON credits (restaurant_id, customer_id);
CREATE INDEX idx_credits_open
  ON credits (restaurant_id, opened_at DESC)
  WHERE status IN ('open', 'partially_paid');

CREATE TRIGGER trg_credits_updated_at
  BEFORE UPDATE ON credits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Remboursements : en une ou plusieurs fois (§8).
-- Chaque remboursement alimente la caisse (§7, §10).
-- -------------------------------------------------------------
CREATE TABLE credit_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  credit_id      uuid        NOT NULL,

  amount         numeric(14, 2) NOT NULL CHECK (amount > 0),
  payment_method text        NOT NULL DEFAULT 'cash'
                             CHECK (payment_method IN ('cash', 'mobile_money', 'card', 'bank_transfer')),
  note           text,
  paid_at        timestamptz NOT NULL DEFAULT now(),

  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT credit_payments_credit_fk
    FOREIGN KEY (credit_id, restaurant_id)
    REFERENCES credits (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT credit_payments_created_by_fk
    FOREIGN KEY (created_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL
);

CREATE INDEX idx_credit_payments_credit
  ON credit_payments (restaurant_id, credit_id, paid_at DESC);

-- Le statut et le montant remboursé de la créance sont maintenus par la base :
-- impossible d'avoir une créance « payée » sans remboursement correspondant.
CREATE OR REPLACE FUNCTION refresh_credit_from_payments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_credit_id uuid := COALESCE(NEW.credit_id, OLD.credit_id);
  v_paid      numeric(14, 2);
  v_due       numeric(14, 2);
BEGIN
  SELECT COALESCE(sum(amount), 0) INTO v_paid
  FROM credit_payments WHERE credit_id = v_credit_id;

  SELECT amount_due INTO v_due FROM credits WHERE id = v_credit_id;

  UPDATE credits
     SET amount_paid = v_paid,
         status = CASE
                    WHEN status = 'cancelled' THEN 'cancelled'
                    WHEN v_paid >= v_due      THEN 'paid'
                    WHEN v_paid > 0           THEN 'partially_paid'
                    ELSE 'open'
                  END,
         settled_at = CASE WHEN v_paid >= v_due THEN now() ELSE NULL END
   WHERE id = v_credit_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_credit_payments_refresh
  AFTER INSERT OR UPDATE OR DELETE ON credit_payments
  FOR EACH ROW EXECUTE FUNCTION refresh_credit_from_payments();

COMMENT ON TABLE credits IS
  'Liste des créances en cours : qui doit combien (§8). La vente à crédit '
  'n''alimente pas la caisse tant qu''elle n''est pas remboursée.';
