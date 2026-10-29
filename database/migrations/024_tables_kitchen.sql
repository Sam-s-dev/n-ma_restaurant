-- =============================================================
-- 024 — Service en salle : tables, additions, cuisine
--
-- Le serveur prend la commande à la table, le cuisinier la prépare, le
-- caissier encaisse. Une table peut accueillir plusieurs clients qui ne
-- sont pas ensemble : chacun a son addition, payée séparément. Une
-- addition reçoit plusieurs envois en cuisine au fil du repas.
-- =============================================================

ALTER TABLE users DROP CONSTRAINT users_role_allowed;
ALTER TABLE users ADD CONSTRAINT users_role_allowed
  CHECK (role IN ('manager', 'cashier', 'storekeeper', 'driver', 'waiter', 'cook'));

ALTER TABLE user_invitations DROP CONSTRAINT user_invitations_role_allowed;
ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_role_allowed
  CHECK (role IN ('manager', 'cashier', 'storekeeper', 'driver', 'waiter', 'cook'));

-- Seuils d'attente en cuisine, en minutes : orange, puis rouge et gérant prévenu.
ALTER TABLE restaurants
  ADD COLUMN kitchen_warn_minutes integer NOT NULL DEFAULT 15 CHECK (kitchen_warn_minutes BETWEEN 1 AND 180),
  ADD COLUMN kitchen_late_minutes integer NOT NULL DEFAULT 25 CHECK (kitchen_late_minutes BETWEEN 1 AND 240),
  ADD CONSTRAINT restaurants_kitchen_thresholds CHECK (kitchen_late_minutes > kitchen_warn_minutes);

-- -------------------------------------------------------------
-- Tables de la salle
-- -------------------------------------------------------------
CREATE TABLE dining_tables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  name           text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  area           text        CHECK (length(area) <= 40),       -- Salle, Terrasse, VIP
  position       integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dining_tables_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE UNIQUE INDEX uq_dining_tables_name
  ON dining_tables (restaurant_id, lower(btrim(name)));

CREATE TRIGGER trg_dining_tables_updated_at
  BEFORE UPDATE ON dining_tables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Additions : un client ou un groupe, à une table.
--   open → bill_requested → paid, ou cancelled
-- -------------------------------------------------------------
CREATE TABLE table_bills (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id      uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  table_id           uuid        NOT NULL,
  reference          text        NOT NULL,                       -- AD-20261029-0001
  label              text        CHECK (length(label) <= 60),    -- « Groupe de 4 »
  guests             integer     NOT NULL DEFAULT 1 CHECK (guests BETWEEN 1 AND 99),
  status             text        NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open', 'bill_requested', 'paid', 'cancelled')),
  waiter_id          uuid,
  opened_at          timestamptz NOT NULL DEFAULT now(),
  bill_requested_at  timestamptz,
  paid_at            timestamptz,
  paid_by            uuid,
  sale_id            uuid,
  closed_reason      text,
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT table_bills_table_fk
    FOREIGN KEY (table_id, restaurant_id)
    REFERENCES dining_tables (id, restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT table_bills_waiter_fk
    FOREIGN KEY (waiter_id, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (waiter_id),
  CONSTRAINT table_bills_paid_by_fk
    FOREIGN KEY (paid_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (paid_by),
  CONSTRAINT table_bills_sale_fk
    FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES sales (id, restaurant_id) ON DELETE SET NULL (sale_id),
  CONSTRAINT table_bills_reference_key UNIQUE (restaurant_id, reference),
  CONSTRAINT table_bills_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE INDEX idx_table_bills_open
  ON table_bills (restaurant_id, table_id) WHERE status IN ('open', 'bill_requested');
CREATE INDEX idx_table_bills_status ON table_bills (restaurant_id, status, opened_at DESC);

CREATE TRIGGER trg_table_bills_updated_at
  BEFORE UPDATE ON table_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Tickets de cuisine : un envoi du serveur, ou une commande en ligne
-- acceptée. Toute la cuisine passe par le même écran.
-- -------------------------------------------------------------
CREATE TABLE kitchen_tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  source           text        NOT NULL CHECK (source IN ('table', 'online')),
  bill_id          uuid,
  order_id         uuid,
  status           text        NOT NULL DEFAULT 'new'
                               CHECK (status IN ('new', 'preparing', 'ready', 'served', 'cancelled')),
  sent_by          uuid,
  started_at       timestamptz,
  ready_at         timestamptz,
  late_notified_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kitchen_tickets_bill_fk
    FOREIGN KEY (bill_id, restaurant_id)
    REFERENCES table_bills (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT kitchen_tickets_order_fk
    FOREIGN KEY (order_id, restaurant_id)
    REFERENCES online_orders (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT kitchen_tickets_sent_by_fk
    FOREIGN KEY (sent_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (sent_by),
  CONSTRAINT kitchen_tickets_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT kitchen_tickets_source_link CHECK (
    (source = 'table' AND bill_id IS NOT NULL AND order_id IS NULL)
    OR (source = 'online' AND order_id IS NOT NULL AND bill_id IS NULL)
  )
);

CREATE INDEX idx_kitchen_tickets_active
  ON kitchen_tickets (restaurant_id, created_at) WHERE status IN ('new', 'preparing', 'ready');
CREATE INDEX idx_kitchen_tickets_bill ON kitchen_tickets (bill_id) WHERE bill_id IS NOT NULL;
CREATE UNIQUE INDEX uq_kitchen_tickets_order ON kitchen_tickets (order_id) WHERE order_id IS NOT NULL;

-- Lignes d'un ticket : chaque plat suit son propre état, du « envoyé » au « servi ».
CREATE TABLE kitchen_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  ticket_id        uuid        NOT NULL,
  bill_id          uuid,
  dish_id          uuid,
  dish_name        text        NOT NULL,
  unit_price       numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  quantity         integer     NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  note             text        CHECK (length(note) <= 200),
  status           text        NOT NULL DEFAULT 'sent'
                               CHECK (status IN ('sent', 'preparing', 'ready', 'served', 'cancelled')),
  ready_at         timestamptz,
  served_at        timestamptz,
  cancelled_reason text,
  cancelled_by     uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kitchen_items_ticket_fk
    FOREIGN KEY (ticket_id, restaurant_id)
    REFERENCES kitchen_tickets (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT kitchen_items_bill_fk
    FOREIGN KEY (bill_id, restaurant_id)
    REFERENCES table_bills (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT kitchen_items_dish_fk
    FOREIGN KEY (dish_id, restaurant_id)
    REFERENCES dishes (id, restaurant_id) ON DELETE SET NULL (dish_id),
  CONSTRAINT kitchen_items_cancelled_by_fk
    FOREIGN KEY (cancelled_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (cancelled_by)
);

CREATE INDEX idx_kitchen_items_ticket ON kitchen_items (ticket_id);
CREATE INDEX idx_kitchen_items_bill ON kitchen_items (bill_id) WHERE bill_id IS NOT NULL;

-- Qui a servi : les ventes en salle gardent le serveur, pour les rapports.
ALTER TABLE sales ADD COLUMN served_by uuid;
ALTER TABLE sales
  ADD CONSTRAINT sales_served_by_fk
    FOREIGN KEY (served_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (served_by);

COMMENT ON TABLE table_bills IS
  'Addition d''un client ou d''un groupe à une table. Plusieurs additions '
  'peuvent être ouvertes à la même table, chacune payée séparément.';
