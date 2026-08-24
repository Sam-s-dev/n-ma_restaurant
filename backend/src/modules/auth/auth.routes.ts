import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { requireUser } from '../../middlewares/auth';
import { authRateLimit } from '../../middlewares/rateLimit';
import * as controller from './auth.controller';

export const authRouter = Router();

// Routes publiques (protégées contre le bourrinage).
authRouter.post('/register', authRateLimit, asyncHandler(controller.register));
authRouter.post('/login', authRateLimit, asyncHandler(controller.login));
authRouter.post('/refresh', asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));

// Invitations (§2.b)
authRouter.get('/invitations', asyncHandler(controller.inspectInvitation));
authRouter.post('/invitations/accept', authRateLimit, asyncHandler(controller.acceptInvitation));

// Routes authentifiées.
authRouter.get('/me', requireUser, asyncHandler(controller.me));
authRouter.post('/change-password', requireUser, asyncHandler(controller.changePassword));
