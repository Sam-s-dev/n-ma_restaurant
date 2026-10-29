import webpush from 'web-push';
import { logger } from '../../config/logger';
import { query, queryOne } from '../../db/pool';

/**
 * Notifications sur le téléphone, application fermée (Web Push).
 *
 * Les clés de signature sont créées au premier démarrage et gardées en
 * base : rien à configurer sur l'hébergement, et elles survivent aux
 * redéploiements. Les changer couperait tous les abonnements.
 */

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keys: Promise<VapidKeys> | null = null;

async function loadKeys(): Promise<VapidKeys> {
  const existing = await query<{ key: string; value: string }>(
    `SELECT key, value FROM platform_settings WHERE key IN ('vapid_public', 'vapid_private')`,
  );
  const publicKey = existing.find((row) => row.key === 'vapid_public')?.value;
  const privateKey = existing.find((row) => row.key === 'vapid_private')?.value;
  if (publicKey && privateKey) return { publicKey, privateKey };

  const generated = webpush.generateVAPIDKeys();
  // Deux instances qui démarrent ensemble : la première écrit, la seconde
  // relit ce qu'elle a écrit.
  await query(
    `INSERT INTO platform_settings (key, value) VALUES ('vapid_public', $1), ('vapid_private', $2)
     ON CONFLICT (key) DO NOTHING`,
    [generated.publicKey, generated.privateKey],
  );
  const stored = await query<{ key: string; value: string }>(
    `SELECT key, value FROM platform_settings WHERE key IN ('vapid_public', 'vapid_private')`,
  );
  return {
    publicKey: stored.find((row) => row.key === 'vapid_public')!.value,
    privateKey: stored.find((row) => row.key === 'vapid_private')!.value,
  };
}

function vapid(): Promise<VapidKeys> {
  keys ??= loadKeys().catch((error) => {
    keys = null;
    throw error;
  });
  return keys;
}

export async function publicKey(): Promise<string> {
  return (await vapid()).publicKey;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Un appareil, un abonnement : se réabonner le rattache au compte du moment. */
export async function subscribe(
  owner: { userId: string } | { orderId: string },
  subscription: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const userId = 'userId' in owner ? owner.userId : null;
  const orderId = 'orderId' in owner ? owner.orderId : null;
  await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, order_id, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE
       SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
           user_id = EXCLUDED.user_id, order_id = EXCLUDED.order_id,
           user_agent = EXCLUDED.user_agent`,
    [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userId, orderId, userAgent],
  );
}

export async function unsubscribe(endpoint: string): Promise<void> {
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

/** Déconnexion : l'appareil ne reçoit plus les messages de ce compte. */
export async function unsubscribeUser(userId: string, endpoint?: string): Promise<void> {
  await query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 ${endpoint ? 'AND endpoint = $2' : ''}`,
    endpoint ? [userId, endpoint] : [userId],
  );
}

export interface PushMessage {
  title: string;
  body: string;
  /** Page ouverte au toucher du message. */
  url: string;
  /** Deux messages de même étiquette se remplacent au lieu de s'empiler. */
  tag?: string;
}

async function deliver(
  rows: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
  message: PushMessage,
): Promise<void> {
  if (rows.length === 0) return;
  const { publicKey: pub, privateKey } = await vapid();
  const payload = JSON.stringify(message);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
          {
            vapidDetails: { subject: 'mailto:contact@nma-restaurant.app', publicKey: pub, privateKey },
            TTL: 60 * 60 * 12,
            urgency: 'high',
          },
        );
        await query('UPDATE push_subscriptions SET last_success_at = now() WHERE id = $1', [row.id]);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // L'appareil s'est désabonné (application supprimée, autorisation retirée).
        if (status === 404 || status === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [row.id]).catch(() => undefined);
          return;
        }
        logger.warn({ status, err: (error as Error).message }, 'Envoi d’une notification push impossible');
      }
    }),
  );
}

/** Aux comptes du restaurant ; l'échec d'un envoi ne remonte jamais à l'appelant. */
export async function pushToUsers(userIds: string[], message: PushMessage): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const rows = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])',
      [userIds],
    );
    await deliver(rows, message);
  } catch (error) {
    logger.warn({ err: (error as Error).message }, 'Notifications push non envoyées');
  }
}

/** Au client qui suit sa commande sur le mini-site. */
export async function pushToOrder(orderId: string, message: PushMessage): Promise<void> {
  try {
    const rows = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE order_id = $1',
      [orderId],
    );
    await deliver(rows, message);
  } catch (error) {
    logger.warn({ err: (error as Error).message }, 'Notification push au client non envoyée');
  }
}

export async function restaurantName(restaurantId: string): Promise<string> {
  const row = await queryOne<{ name: string }>('SELECT name FROM restaurants WHERE id = $1', [restaurantId]);
  return row?.name ?? 'N’ma Restaurant';
}
