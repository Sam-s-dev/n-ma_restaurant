import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { requireUser } from '../../middlewares/auth';
import * as controller from './media.controller';
import { uploadImage } from './media.upload';

export const mediaRouter = Router();

// Lecture publique par UUID (voir commentaire dans le contrôleur).
mediaRouter.get('/:id', asyncHandler(controller.download));

// Envoi réservé aux utilisateurs authentifiés du restaurant.
mediaRouter.post('/', requireUser, uploadImage, asyncHandler(controller.upload));
