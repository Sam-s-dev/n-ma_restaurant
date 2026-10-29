import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/asyncHandler';
import { parseOrThrow } from '../../core/validate';
import { currentUser, requireUser } from '../../middlewares/auth';
import * as service from './push.service';

export const subscriptionSchema = z.object({
  endpoint: z.string().url('Abonnement invalide.').max(1000),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(8).max(100),
  }),
});

const endpointSchema = z.object({ endpoint: z.string().url().max(1000) });

const agentOf = (req: Request) => req.get('user-agent')?.slice(0, 300) ?? null;

/** Abonnements aux notifications sur le téléphone. */
export const pushRouter = Router();

// La clé publique sert à l'abonnement ; elle n'a rien de secret.
pushRouter.get(
  '/key',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ publicKey: await service.publicKey() });
  }),
);

pushRouter.post(
  '/subscribe',
  requireUser,
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = parseOrThrow(subscriptionSchema, req.body, 'requête');
    await service.subscribe({ userId: currentUser(req).id }, subscription, agentOf(req));
    res.status(204).end();
  }),
);

// Sans compte : l'adresse d'abonnement, que seul l'appareil connaît, suffit.
pushRouter.post(
  '/unsubscribe',
  asyncHandler(async (req: Request, res: Response) => {
    const { endpoint } = parseOrThrow(endpointSchema, req.body, 'requête');
    await service.unsubscribe(endpoint);
    res.status(204).end();
  }),
);

export { agentOf };
