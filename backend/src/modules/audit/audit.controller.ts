import type { Request, Response } from 'express';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './audit.service';
import { listAuditSchema } from './audit.schemas';

export async function listAudit(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listAuditSchema, req.query, 'requête');
  res.json(await service.listAudit(user.restaurantId, input));
}
