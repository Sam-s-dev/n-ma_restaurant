-- =============================================================
-- 022 — Ouverture et clôture de caisse
--
-- Une session couvre une journée de travail : on compte le fond de caisse
-- à l'ouverture, on compte le tiroir à la clôture, et l'écart entre
-- l'attendu et le compté apparaît noir sur blanc.
--
-- Le grand livre (cash_movements) additionne espèces, Mobile Money et
-- carte. Or on ne compte que les espèces du tiroir : l'attendu se calcule
-- donc par mode de paiement, à partir des mouvements de la session.
-- =============================================================

CREATE TABLE cash_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  reference            text        NOT NULL,
  status               text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),

  opened_by            uuid,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  opening_float        numeric(14, 2) NOT NULL CHECK (opening_float >= 0),
  -- Comptage par billet : { "20000": 3, "5000": 2 }. Facultatif.
  opening_breakdown    jsonb,

  closed_by            uuid,
  closed_at            timestamptz,
  counted_cash         numeric(14, 2) CHECK (counted_cash IS NULL OR counted_cash >= 0),
  counted_breakdown    jsonb,
  counted_mobile_money numeric(14, 2) CHECK (counted_mobile_money IS NULL OR counted_mobile_money >= 0),
  expected_cash        numeric(14, 2),
  expected_mobile_money numeric(14, 2),
  cash_difference      numeric(14, 2),
  mobile_money_difference numeric(14, 2),
  close_note           text,
  -- Chiffres du ticket Z figés au moment de la clôture.
  summary              jsonb,

  -- Correction du solde décidée par le gérant après coup.
  correction_movement_id uuid,
  corrected_by         uuid,
  corrected_at         timestamptz,

  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cash_sessions_reference_key UNIQUE (restaurant_id, reference),
  CONSTRAINT cash_sessions_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT cash_sessions_opened_by_fk
    FOREIGN KEY (opened_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (opened_by),
  CONSTRAINT cash_sessions_closed_by_fk
    FOREIGN KEY (closed_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (closed_by),
  CONSTRAINT cash_sessions_corrected_by_fk
    FOREIGN KEY (corrected_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (corrected_by),
  CONSTRAINT cash_sessions_correction_fk
    FOREIGN KEY (correction_movement_id) REFERENCES cash_movements (id) ON DELETE SET NULL,

  CONSTRAINT cash_sessions_closed_complete CHECK (
    status = 'open' OR (closed_at IS NOT NULL AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL)
  )
);

-- Une seule caisse ouverte à la fois par restaurant.
CREATE UNIQUE INDEX uq_cash_sessions_one_open
  ON cash_sessions (restaurant_id) WHERE status = 'open';
CREATE INDEX idx_cash_sessions_restaurant_date
  ON cash_sessions (restaurant_id, opened_at DESC);

-- Chaque mouvement écrit pendant une session lui est rattaché.
ALTER TABLE cash_movements ADD COLUMN session_id uuid;
ALTER TABLE cash_movements
  ADD CONSTRAINT cash_movements_session_fk
    FOREIGN KEY (session_id, restaurant_id)
    REFERENCES cash_sessions (id, restaurant_id) ON DELETE SET NULL (session_id);
CREATE INDEX idx_cash_movements_session ON cash_movements (session_id) WHERE session_id IS NOT NULL;
