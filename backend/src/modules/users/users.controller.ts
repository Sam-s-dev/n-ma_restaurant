import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './users.service';
import { inviteUserSchema, updateMemberSchema } from './users.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant invalide.') });

export async function listMembers(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ items: await service.listMembers(user.restaurantId) });
}

export async function updateMember(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(updateMemberSchema, req.body, 'requête');
  res.json(await service.updateMember(user.restaurantId, id, user.id, input));
}

export async function invite(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(inviteUserSchema, req.body, 'invitation');
  res.status(201).json(await service.inviteUser(user.restaurantId, user.id, input));
}

export async function listInvitations(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ items: await service.listInvitations(user.restaurantId) });
}

export async function revokeInvitation(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  await service.revokeInvitation(user.restaurantId, id);
  res.status(204).send();
}
