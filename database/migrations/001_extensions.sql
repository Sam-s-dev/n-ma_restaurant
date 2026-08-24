-- =============================================================
-- 001 — Extensions et fonctions utilitaires partagées
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- emails insensibles à la casse

-- Met à jour automatiquement la colonne updated_at à chaque UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Génère une référence de document lisible (ex : V-20260823-0042)
-- à partir d'une séquence quotidienne stockée en table.
CREATE TABLE IF NOT EXISTS document_counters (
  restaurant_id  uuid        NOT NULL,
  scope          text        NOT NULL,          -- 'sale', 'expense', ...
  day            date        NOT NULL,
  last_value     integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, scope, day)
);

CREATE OR REPLACE FUNCTION next_document_reference(
  p_restaurant_id uuid,
  p_scope         text,
  p_prefix        text,
  p_day           date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_value integer;
BEGIN
  INSERT INTO document_counters (restaurant_id, scope, day, last_value)
  VALUES (p_restaurant_id, p_scope, p_day, 1)
  ON CONFLICT (restaurant_id, scope, day)
  DO UPDATE SET last_value = document_counters.last_value + 1
  RETURNING last_value INTO v_value;

  RETURN p_prefix || '-' || to_char(p_day, 'YYYYMMDD') || '-' || lpad(v_value::text, 4, '0');
END;
$$;
