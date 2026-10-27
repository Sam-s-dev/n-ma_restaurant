import type { Request } from 'express';
import { conflict } from '../../core/errors';
import { can } from '../../middlewares/auth';
import { hasOpenSession } from './sessions.service';

/**
 * Le caissier commence sa journée en ouvrant la caisse : chaque vente et
 * chaque remboursement qu'il encaisse se rattachent ainsi à une session, et
 * la clôture du soir sait ce que le tiroir doit contenir. Le gérant, lui,
 * peut toujours dépanner sans caisse ouverte.
 */
export async function requireOpenSessionUnlessManager(
  req: Request,
  restaurantId: string,
): Promise<void> {
  if (can(req, 'cash.manage')) return;
  if (await hasOpenSession(restaurantId)) return;
  throw conflict('La caisse n’est pas ouverte. Ouvrez-la en comptant le fond de caisse avant d’encaisser.', {
    reason: 'cash_session_closed',
  });
}
