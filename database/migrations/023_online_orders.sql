-- =============================================================
-- 023 — Mini-site de commande en ligne et livreurs
--
-- Chaque restaurant a sa propre adresse publique (/r/<slug>), ses zones
-- de livraison, ses commandes et ses livreurs. Rien n'est partagé entre
-- restaurants : un livreur est un compte du restaurant, il ne voit que
-- les courses qu'on lui confie.
--
-- Une commande n'est pas une vente. La vente naît quand l'argent est
-- réellement dans la caisse : au comptoir pour un retrait, au retour du
-- livreur pour une livraison. Entre les deux, l'argent est « chez le
-- livreur » et le gérant le voit.
-- =============================================================

-- Rôle Livreur.
ALTER TABLE users DROP CONSTRAINT users_role_allowed;
ALTER TABLE users ADD CONSTRAINT users_role_allowed
  CHECK (role IN ('manager', 'cashier', 'storekeeper', 'driver'));

ALTER TABLE user_invitations DROP CONSTRAINT user_invitations_role_allowed;
ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_role_allowed
  CHECK (role IN ('manager', 'cashier', 'storekeeper', 'driver'));

-- -------------------------------------------------------------
-- Réglages du mini-site, propres à chaque restaurant.
-- -------------------------------------------------------------
ALTER TABLE restaurants
  ADD COLUMN slug text
    CONSTRAINT restaurants_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 40),
  -- Décidé par le Super Admin : le restaurant peut-il avoir un mini-site ?
  ADD COLUMN online_allowed  boolean NOT NULL DEFAULT true,
  -- Décidé par le gérant : accepte-t-il des commandes en ce moment ?
  ADD COLUMN online_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN online_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN online_pickup   boolean NOT NULL DEFAULT true,
  -- Heures de Conakry ; NULL = pas de limite horaire.
  ADD COLUMN online_opens_at  time,
  ADD COLUMN online_closes_at time,
  ADD COLUMN online_message  text CHECK (length(online_message) <= 300),
  ADD CONSTRAINT restaurants_online_mode
    CHECK (online_delivery OR online_pickup);

CREATE UNIQUE INDEX uq_restaurants_slug ON restaurants (slug) WHERE slug IS NOT NULL;

-- Le gérant choisit les plats proposés en ligne (tous par défaut).
ALTER TABLE dishes ADD COLUMN is_online boolean NOT NULL DEFAULT true;

-- -------------------------------------------------------------
-- Zones de livraison et leur prix.
-- -------------------------------------------------------------
CREATE TABLE delivery_zones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  name           text        NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  fee            numeric(14, 2) NOT NULL CHECK (fee >= 0),
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delivery_zones_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE UNIQUE INDEX uq_delivery_zones_name
  ON delivery_zones (restaurant_id, lower(btrim(name)));

CREATE TRIGGER trg_delivery_zones_updated_at
  BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- Commandes en ligne.
--
--   pending          → reçue, à confirmer par téléphone
--   accepted         → acceptée, en préparation (portions réservées)
--   ready            → prête
--   out_for_delivery → partie avec le livreur
--   delivered        → livrée, argent chez le livreur
--   completed        → argent en caisse, la vente existe
--   rejected / cancelled
-- -------------------------------------------------------------
CREATE TABLE online_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  reference        text        NOT NULL,                  -- CL-20261027-0001
  -- Code du lien de suivi donné au client : impossible à deviner.
  tracking_code    text        NOT NULL UNIQUE,

  customer_name    text        NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 2 AND 120),
  customer_phone   text        NOT NULL,
  mode             text        NOT NULL CHECK (mode IN ('delivery', 'pickup')),
  zone_id          uuid,
  zone_name        text,                                   -- figé à la commande
  landmark         text        CHECK (length(landmark) <= 300),
  note             text        CHECK (length(note) <= 300),
  payment_method   text        NOT NULL CHECK (payment_method IN ('cash', 'mobile_money')),

  items_total      numeric(14, 2) NOT NULL CHECK (items_total >= 0),
  delivery_fee     numeric(14, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total_amount     numeric(14, 2) NOT NULL CHECK (total_amount >= 0),

  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN (
                     'pending', 'accepted', 'ready', 'out_for_delivery',
                     'delivered', 'completed', 'rejected', 'cancelled'
                   )),

  accepted_at      timestamptz,
  accepted_by      uuid,
  ready_at         timestamptz,
  driver_id        uuid,
  assigned_at      timestamptz,
  dispatched_at    timestamptz,
  delivered_at     timestamptz,
  -- Ce que le livreur a réellement reçu du client.
  collected_method text        CHECK (collected_method IN ('cash', 'mobile_money')),
  completed_at     timestamptz,
  completed_by     uuid,
  sale_id          uuid,
  closed_reason    text,                                   -- refus ou annulation
  closed_at        timestamptz,
  cancelled_by_customer boolean NOT NULL DEFAULT false,
  -- Dernier incident signalé par le livreur (client injoignable…).
  delivery_issue   text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT online_orders_zone_fk
    FOREIGN KEY (zone_id, restaurant_id)
    REFERENCES delivery_zones (id, restaurant_id) ON DELETE SET NULL (zone_id),
  CONSTRAINT online_orders_driver_fk
    FOREIGN KEY (driver_id, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (driver_id),
  CONSTRAINT online_orders_accepted_by_fk
    FOREIGN KEY (accepted_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (accepted_by),
  CONSTRAINT online_orders_completed_by_fk
    FOREIGN KEY (completed_by, restaurant_id)
    REFERENCES users (id, restaurant_id) ON DELETE SET NULL (completed_by),
  CONSTRAINT online_orders_sale_fk
    FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES sales (id, restaurant_id) ON DELETE SET NULL (sale_id),

  CONSTRAINT online_orders_reference_key UNIQUE (restaurant_id, reference),
  CONSTRAINT online_orders_id_restaurant_key UNIQUE (id, restaurant_id),

  CONSTRAINT online_orders_pickup_no_driver
    CHECK (mode = 'delivery' OR driver_id IS NULL),
  CONSTRAINT online_orders_delivered_collected
    CHECK (status NOT IN ('delivered') OR collected_method IS NOT NULL)
);

CREATE INDEX idx_online_orders_restaurant_status
  ON online_orders (restaurant_id, status, created_at DESC);
CREATE INDEX idx_online_orders_driver
  ON online_orders (restaurant_id, driver_id, status) WHERE driver_id IS NOT NULL;

CREATE TRIGGER trg_online_orders_updated_at
  BEFORE UPDATE ON online_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE online_order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
  order_id       uuid        NOT NULL,
  dish_id        uuid,
  dish_name      text        NOT NULL,
  unit_price     numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  quantity       integer     NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_total     numeric(14, 2) NOT NULL CHECK (line_total >= 0),

  CONSTRAINT online_order_items_order_fk
    FOREIGN KEY (order_id, restaurant_id)
    REFERENCES online_orders (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT online_order_items_dish_fk
    FOREIGN KEY (dish_id, restaurant_id)
    REFERENCES dishes (id, restaurant_id) ON DELETE SET NULL (dish_id)
);

CREATE INDEX idx_online_order_items_order ON online_order_items (order_id);

COMMENT ON COLUMN online_orders.status IS
  'delivered = remise au client, argent chez le livreur ; completed = argent '
  'reçu en caisse, la vente (sale_id) existe.';
