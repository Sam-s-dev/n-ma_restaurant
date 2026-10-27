import type { RequestHandler } from 'express';
import { logger } from '../config/logger';
import { recordAudit } from '../modules/audit/audit.service';

/** Au-delà, le détail n'apprend plus rien au gérant et alourdit la table. */
const MAX_DETAILS_BYTES = 4000;

/** Champs de la réponse utiles pour reconnaître l'objet touché dans le journal. */
const RESPONSE_KEYS = ['reference', 'name', 'fullName', 'totalAmount', 'amount', 'role'] as const;

/**
 * Inscrit l'action au journal d'activité une fois la réponse partie, et
 * seulement si elle a réussi : une tentative refusée n'a rien changé.
 *
 * L'écriture du journal ne doit jamais faire échouer l'action elle-même :
 * une erreur est consignée dans les logs, la vente reste enregistrée.
 */
export function audited(action: string): RequestHandler {
  return (req, res, next) => {
    const user = req.user;
    // Capturés maintenant : après le routage, Express peut avoir remis
    // `req.params` à zéro.
    const entityParam = typeof req.params.id === 'string' ? req.params.id : null;
    const body: unknown = req.body;

    let responseBody: unknown;
    const json = res.json.bind(res);
    res.json = (payload: unknown) => {
      responseBody = payload;
      return json(payload);
    };

    res.on('finish', () => {
      if (!user || res.statusCode >= 400) return;

      const response = isRecord(responseBody) ? responseBody : {};
      const entityId =
        entityParam ?? (typeof response.id === 'string' ? response.id : null);

      recordAudit({
        restaurantId: user.restaurantId,
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        action,
        entityId,
        details: buildDetails(body, response),
      }).catch((error: unknown) => {
        logger.error({ err: error, action }, 'Écriture du journal d’activité impossible');
      });
    });

    next();
  };
}

function buildDetails(
  body: unknown,
  response: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  if (isRecord(body)) {
    for (const [key, value] of Object.entries(body)) {
      if (/password|token/i.test(key)) continue;
      details[key] = value;
    }
  }
  for (const key of RESPONSE_KEYS) {
    if (response[key] !== undefined && details[key] === undefined) details[key] = response[key];
  }

  return JSON.stringify(details).length > MAX_DETAILS_BYTES ? { truncated: true } : details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
