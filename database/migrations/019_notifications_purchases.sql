-- =============================================================
-- 019 — Notifications et demandes d'achat
--
-- Notifications : chaque compte reçoit les siennes, comme une messagerie.
-- Une ligne par destinataire plutôt qu'une ligne partagée : « lu » est
-- propre à chacun, et le gérant qui lit ne marque rien pour son collègue.
--
-- Demandes d'achat : le magasinier ne sort plus d'argent de sa propre
-- initiative. Il demande, le gérant approuve un montant, puis l'achat réel
-- est enregistré sans pouvoir dépasser ce montant.
-- =============================================================

CREATE TABLE notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  kind           text        NOT NULL CHECK (kind ~ '^[a-z_]+\.[a-z_]+$'),
  title          text        NOT NULL,
  body           text        NOT NULL DEFAULT '',
  -- Écran de l'application à ouvrir au toucher (« purchases », « sales »…).
  route          text,
  entity_id      uuid,
  actor_name     text,

  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_date ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

-- -------------------------------------------------------------
-- Demandes d'achat
-- -------------------------------------------------------------
CREATE TABLE purchase_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  reference        text        NOT NULL,

  -- Produit déjà suivi en stock, ou nom libre pour un produit à créer à
  -- l'achat : on ne force pas le magasinier à remplir une fiche avant de
  -- savoir si l'achat sera accepté.
  stock_item_id    uuid,
  item_name        text        NOT NULL CHECK (length(btrim(item_name)) BETWEEN 1 AND 120),
  unit             text,
  quantity         numeric(14, 3) NOT NULL CHECK (quantity > 0),
  estimated_amount numeric(14, 2) NOT NULL CHECK (estimated_amount > 0),
  reason           text,

  status           text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),

  requested_by     uuid,
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text,
  -- Plafond fixé par le gérant : l'achat réel ne peut pas le dépasser.
  approved_amount  numeric(14, 2) CHECK (approved_amount IS NULL OR approved_amount > 0),

  expense_id       uuid,
  completed_by     uuid,
  completed_at     timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT purchase_requests_reference_key UNIQUE (restaurant_id, reference),
  CONSTRAINT purchase_requests_stock_item_fk
    FOREIGN KEY (stock_item_id, restaurant_id)
    REFERENCES stock_items (id, restaurant_id) ON DELETE SET NULL (stock_item_id),
  CONSTRAINT purchase_requests_requested_by_fk
    FOREIGN KEY (requested_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (requested_by),
  CONSTRAINT purchase_requests_decided_by_fk
    FOREIGN KEY (decided_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (decided_by),
  CONSTRAINT purchase_requests_completed_by_fk
    FOREIGN KEY (completed_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (completed_by),
  CONSTRAINT purchase_requests_expense_fk
    FOREIGN KEY (expense_id, restaurant_id)
    REFERENCES expenses (id, restaurant_id) ON DELETE SET NULL (expense_id),

  -- Chaque état porte les informations qui le justifient.
  CONSTRAINT purchase_requests_decision_complete CHECK (
    status IN ('pending', 'cancelled') OR (decided_by IS NOT NULL OR decided_at IS NOT NULL)
  ),
  CONSTRAINT purchase_requests_approved_has_amount CHECK (
    status NOT IN ('approved', 'completed') OR approved_amount IS NOT NULL
  ),
  CONSTRAINT purchase_requests_completed_has_expense CHECK (
    status <> 'completed' OR expense_id IS NOT NULL
  )
);

CREATE INDEX idx_purchase_requests_restaurant
  ON purchase_requests (restaurant_id, created_at DESC);
CREATE INDEX idx_purchase_requests_pending
  ON purchase_requests (restaurant_id) WHERE status IN ('pending', 'approved');

CREATE TRIGGER trg_purchase_requests_updated_at
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
