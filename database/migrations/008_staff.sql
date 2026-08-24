-- =============================================================
-- 008 — Personnel : fiches employés et pointage
-- Cahier des charges §4
-- =============================================================

CREATE TABLE employees (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,

  full_name        text        NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  position         text        NOT NULL,            -- poste (cuisinier, serveur...)
  phone            text,
  hire_date        date        NOT NULL,
  monthly_salary   numeric(14, 2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),

  is_active        boolean     NOT NULL DEFAULT true,
  end_date         date,
  photo_media_id   uuid        REFERENCES media (id) ON DELETE SET NULL,
  note             text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employees_end_after_hire CHECK (end_date IS NULL OR end_date >= hire_date),
  CONSTRAINT employees_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_employees_restaurant ON employees (restaurant_id) WHERE is_active;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Pointage : présent / absent par jour (§4).
-- -------------------------------------------------------------
CREATE TABLE attendances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  employee_id    uuid        NOT NULL,

  day            date        NOT NULL,
  status         text        NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
  note           text,

  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendances_employee_fk
    FOREIGN KEY (employee_id, restaurant_id)
    REFERENCES employees (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT attendances_created_by_fk
    FOREIGN KEY (created_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL,
  -- Un seul pointage par employé et par jour.
  CONSTRAINT uq_attendances_employee_day UNIQUE (employee_id, day)
);

CREATE INDEX idx_attendances_restaurant_day
  ON attendances (restaurant_id, day DESC);

CREATE TRIGGER trg_attendances_updated_at
  BEFORE UPDATE ON attendances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
