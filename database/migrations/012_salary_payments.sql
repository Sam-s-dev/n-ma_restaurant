-- =============================================================
-- 012 — Paiements de salaire
-- Cahier des charges §4 (historique des paiements, solde restant dû)
-- et §10 (− Caisse, mis à jour dans le module Personnel)
-- =============================================================

CREATE TABLE salary_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  employee_id    uuid        NOT NULL,

  amount         numeric(14, 2) NOT NULL CHECK (amount > 0),
  -- Mois de salaire concerné, normalisé au 1er du mois.
  period_month   date        NOT NULL,
  payment_method text        NOT NULL DEFAULT 'cash'
                             CHECK (payment_method IN ('cash', 'mobile_money', 'card', 'bank_transfer')),
  note           text,
  paid_at        timestamptz NOT NULL DEFAULT now(),

  -- Dépense miroir créée dans la même transaction (catégorie 'salary').
  expense_id     uuid,

  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT salary_payments_period_is_first_of_month
    CHECK (period_month = date_trunc('month', period_month)::date),
  CONSTRAINT salary_payments_employee_fk
    FOREIGN KEY (employee_id, restaurant_id)
    REFERENCES employees (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT salary_payments_expense_fk
    FOREIGN KEY (expense_id, restaurant_id)
    REFERENCES expenses (id, restaurant_id) ON DELETE SET NULL,
  CONSTRAINT salary_payments_created_by_fk
    FOREIGN KEY (created_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL
);

CREATE INDEX idx_salary_payments_employee
  ON salary_payments (restaurant_id, employee_id, period_month DESC);
CREATE INDEX idx_salary_payments_period
  ON salary_payments (restaurant_id, period_month DESC);
