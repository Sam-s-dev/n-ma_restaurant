-- =============================================================
-- 013 — Vues de lecture (tableau de bord, créances, salaires, stock)
-- Cahier des charges §10 « Résumé des liens entre modules »
-- =============================================================

-- Créances en cours : qui doit combien (§8).
CREATE VIEW v_customer_debts AS
SELECT
  c.restaurant_id,
  c.id                                        AS customer_id,
  c.full_name,
  c.phone,
  count(cr.id) FILTER (WHERE cr.status IN ('open', 'partially_paid')) AS open_credits,
  COALESCE(sum(cr.amount_left) FILTER (WHERE cr.status IN ('open', 'partially_paid')), 0) AS total_due,
  COALESCE(sum(cr.amount_due), 0)             AS lifetime_credited,
  COALESCE(sum(cr.amount_paid), 0)            AS lifetime_repaid,
  max(cr.opened_at)                           AS last_credit_at
FROM customers c
LEFT JOIN credits cr
       ON cr.customer_id = c.id
      AND cr.restaurant_id = c.restaurant_id
      AND cr.status <> 'cancelled'
GROUP BY c.restaurant_id, c.id, c.full_name, c.phone;

-- Solde salarial par employé (§4).
-- Le dû est cumulé mois par mois depuis l'embauche jusqu'au mois courant
-- (ou jusqu'au mois de fin de contrat).
CREATE VIEW v_employee_salary_balances AS
WITH periods AS (
  SELECT
    e.restaurant_id,
    e.id AS employee_id,
    e.monthly_salary,
    greatest(
      0,
      (date_part('year',  age(
          least(date_trunc('month', COALESCE(e.end_date, CURRENT_DATE))::date,
                date_trunc('month', CURRENT_DATE)::date),
          date_trunc('month', e.hire_date)::date)) * 12
       + date_part('month', age(
          least(date_trunc('month', COALESCE(e.end_date, CURRENT_DATE))::date,
                date_trunc('month', CURRENT_DATE)::date),
          date_trunc('month', e.hire_date)::date))
      )::int + 1
    ) AS months_elapsed
  FROM employees e
)
SELECT
  p.restaurant_id,
  p.employee_id,
  p.monthly_salary,
  p.months_elapsed,
  (p.monthly_salary * p.months_elapsed)                  AS total_accrued,
  COALESCE(sp.total_paid, 0)                             AS total_paid,
  (p.monthly_salary * p.months_elapsed) - COALESCE(sp.total_paid, 0) AS balance_due,
  sp.last_payment_at
FROM periods p
LEFT JOIN (
  SELECT employee_id,
         sum(amount)  AS total_paid,
         max(paid_at) AS last_payment_at
  FROM salary_payments
  GROUP BY employee_id
) sp ON sp.employee_id = p.employee_id;

-- Produits en stock bas (§6).
CREATE VIEW v_low_stock_items AS
SELECT
  s.restaurant_id,
  s.id AS stock_item_id,
  s.name,
  s.unit,
  s.quantity,
  s.alert_threshold,
  s.purchase_price,
  (s.quantity * s.purchase_price) AS stock_value
FROM stock_items s
WHERE NOT s.is_archived
  AND s.quantity <= s.alert_threshold;

-- Agrégat quotidien pour le tableau de bord.
CREATE VIEW v_daily_cash_summary AS
SELECT
  restaurant_id,
  (occurred_at AT TIME ZONE 'UTC')::date              AS day,
  COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0)  AS total_in,
  COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS total_out,
  COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0)
    - COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS net,
  count(*) AS movements
FROM cash_movements
GROUP BY restaurant_id, (occurred_at AT TIME ZONE 'UTC')::date;
