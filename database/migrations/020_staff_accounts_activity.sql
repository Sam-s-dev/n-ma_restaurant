-- =============================================================
-- 020 — Personnel : comptes liés, retards, activités
--
-- Toute personne qui a un compte dans l'application est aussi un employé
-- (salaire, pointage, historique). L'inverse n'est pas vrai : le plongeur
-- ou l'aide-cuisinier restent dans Personnel sans accès à l'application.
-- Le lien porte donc sur la fiche employé, et reste facultatif.
-- =============================================================

ALTER TABLE employees ADD COLUMN user_id uuid;

ALTER TABLE employees
  ADD CONSTRAINT employees_user_fk
    FOREIGN KEY (user_id, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (user_id);

-- Un compte correspond à une seule fiche employé.
CREATE UNIQUE INDEX uq_employees_user ON employees (user_id) WHERE user_id IS NOT NULL;

-- -------------------------------------------------------------
-- Pointage : le retard rejoint présent / absent / congé, avec l'heure
-- d'arrivée quand on la connaît.
-- -------------------------------------------------------------
ALTER TABLE attendances DROP CONSTRAINT attendances_status_check;
ALTER TABLE attendances
  ADD CONSTRAINT attendances_status_check
    CHECK (status IN ('present', 'late', 'absent', 'leave'));

ALTER TABLE attendances ADD COLUMN arrival_time time;
ALTER TABLE attendances
  ADD CONSTRAINT attendances_arrival_only_when_there
    CHECK (arrival_time IS NULL OR status IN ('present', 'late'));

-- -------------------------------------------------------------
-- Activités d'un employé : ce que le gérant tient à garder par écrit.
-- Écriture seule, comme le journal : on ajoute, on n'efface pas.
-- -------------------------------------------------------------
CREATE TABLE employee_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  employee_id    uuid        NOT NULL,

  kind           text        NOT NULL
    CHECK (kind IN ('late', 'absence', 'warning', 'praise', 'note')),
  note           text        NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 1000),
  occurred_on    date        NOT NULL DEFAULT CURRENT_DATE,

  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employee_notes_employee_fk
    FOREIGN KEY (employee_id, restaurant_id)
    REFERENCES employees (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT employee_notes_created_by_fk
    FOREIGN KEY (created_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (created_by)
);

CREATE INDEX idx_employee_notes_employee ON employee_notes (employee_id, occurred_on DESC);
