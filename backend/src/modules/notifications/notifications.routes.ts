import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './notifications.controller';

/** Ouvert à tous les comptes : chacun ne lit et ne marque que les siennes. */
export const notificationsRouter = Router();

notificationsRouter.get('/', asyncHandler(controller.listNotifications));
notificationsRouter.post('/read', asyncHandler(controller.markRead));
