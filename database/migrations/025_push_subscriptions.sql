-- =============================================================
-- 025 — Notifications sur le téléphone, application fermée
--
-- Chaque appareil qui accepte les notifications s'abonne : le serveur lui
-- envoie un message que le téléphone affiche sur l'écran verrouillé,
-- comme une messagerie. Un abonnement appartient soit à un compte du
-- restaurant, soit au client qui suit une commande du mini-site.
-- =============================================================

CREATE TABLE push_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Adresse fournie par le navigateur : elle identifie l'appareil.
  endpoint         text        NOT NULL UNIQUE,
  p256dh           text        NOT NULL,
  auth             text        NOT NULL,
  user_id          uuid        REFERENCES users (id) ON DELETE CASCADE,
  order_id         uuid        REFERENCES online_orders (id) ON DELETE CASCADE,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_success_at  timestamptz,

  CONSTRAINT push_subscriptions_owner CHECK ((user_id IS NULL) <> (order_id IS NULL))
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_push_subscriptions_order ON push_subscriptions (order_id) WHERE order_id IS NOT NULL;

-- Réglages propres à la plateforme, créés par l'application elle-même :
-- les clés de signature des notifications naissent au premier démarrage
-- et restent les mêmes ensuite (les changer désabonnerait tout le monde).
CREATE TABLE platform_settings (
  key         text PRIMARY KEY,
  value       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
