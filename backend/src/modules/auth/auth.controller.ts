import type { Request, Response } from 'express';
import { parseOrThrow } from '../../core/validate';
import { badRequest } from '../../core/errors';
import { currentUser } from '../../middlewares/auth';
import * as service from './auth.service';
import { revokeSession, rotateSession } from './session.service';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from './auth.schemas';

const agentOf = (req: Request) => req.headers['user-agent']?.slice(0, 200);

export async function register(req: Request, res: Response) {
  const input = parseOrThrow(registerSchema, req.body, 'inscription');
  const result = await service.register(input);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const input = parseOrThrow(loginSchema, req.body, 'connexion');
  const result = await service.login(input, agentOf(req));
  res.json(result);
}

export async function refresh(req: Request, res: Response) {
  const input = parseOrThrow(refreshSchema, req.body, 'requête');
  const { subjectType, subjectId, ...session } = await rotateSession(
    input.refreshToken,
    agentOf(req),
  );
  if (subjectType !== 'user') {
    res.json(session);
    return;
  }
  res.json({ ...session, profile: await service.getProfile(subjectId) });
}

export async function logout(req: Request, res: Response) {
  const input = parseOrThrow(refreshSchema, req.body, 'requête');
  await revokeSession(input.refreshToken);
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.getProfile(user.id));
}

export async function changePassword(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(changePasswordSchema, req.body, 'requête');
  await service.changePassword(user.id, input);
  res.status(204).send();
}

export async function inspectInvitation(req: Request, res: Response) {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) throw badRequest('Paramètre `token` manquant.');
  res.json(await service.inspectInvitation(token));
}

export async function acceptInvitation(req: Request, res: Response) {
  const input = parseOrThrow(acceptInvitationSchema, req.body, 'invitation');
  res.status(201).json(await service.acceptInvitation(input, agentOf(req)));
}
