import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import { rateLimit } from '../../middlewares/rateLimit';
import * as controller from './online.controller';

/** Réglages du mini-site et zones de livraison (espace restaurant). */
export const onlineRouter = Router();

// Le caissier lit les zones et l'état du mini-site, le gérant les règle.
onlineRouter.get('/settings', requirePermission('orders.manage'), asyncHandler(controller.getSettings));
onlineRouter.get('/zones', requirePermission('orders.manage'), asyncHandler(controller.listZones));

const manage = requirePermission('settings.manage');
onlineRouter.patch(
  '/settings',
  manage,
  audited('online.settings_updated'),
  asyncHandler(controller.updateSettings),
);
onlineRouter.post('/zones', manage, audited('online.zone_created'), asyncHandler(controller.createZone));
onlineRouter.patch('/zones/:id', manage, audited('online.zone_updated'), asyncHandler(controller.updateZone));
onlineRouter.delete('/zones/:id', manage, audited('online.zone_deleted'), asyncHandler(controller.deleteZone));

/**
 * Mini-site : sans compte. Chaque restaurant n'est joignable que par son
 * adresse, et le client ne voit que sa propre commande, par son code.
 */
export const publicRouter = Router();

// Un client passe une ou deux commandes ; un robot, des centaines.
const orderLimit = rateLimit({ windowMs: 15 * 60_000, max: 8, key: 'public-order' });
const readLimit = rateLimit({ windowMs: 60_000, max: 120, key: 'public-read' });

publicRouter.get('/r/:slug', readLimit, asyncHandler(controller.publicMenu));
publicRouter.post('/r/:slug/orders', orderLimit, asyncHandler(controller.placeOrder));
publicRouter.get('/orders/:code', readLimit, asyncHandler(controller.trackOrder));
publicRouter.post('/orders/:code/cancel', orderLimit, asyncHandler(controller.cancelTrackedOrder));
