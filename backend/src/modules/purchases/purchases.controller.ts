import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { can, currentUser } from '../../middlewares/auth';
import * as service from './purchases.service';
import {
  approvePurchaseSchema,
  cancelPurchaseSchema,
  completePurchaseSchema,
  createPurchaseRequestSchema,
  listPurchasesSchema,
  rejectPurchaseSchema,
} from './purchases.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant de demande invalide.') });

function actorOf(req: Request) {
  const user = currentUser(req);
  return {
    restaurantId: user.restaurantId,
    userId: user.id,
    userName: user.fullName,
    isApprover: can(req, 'purchases.approve'),
  };
}

export async function listRequests(req: Request, res: Response) {
  const input = parseOrThrow(listPurchasesSchema, req.query, 'requête');
  res.json(await service.listRequests(actorOf(req), input));
}

export async function getRequest(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getRequest(actorOf(req), id));
}

export async function createRequest(req: Request, res: Response) {
  const input = parseOrThrow(createPurchaseRequestSchema, req.body, 'demande');
  res.status(201).json(await service.createRequest(actorOf(req), input));
}

export async function approveRequest(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(approvePurchaseSchema, req.body, 'requête');
  res.json(await service.approveRequest(actorOf(req), id, input));
}

export async function rejectRequest(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(rejectPurchaseSchema, req.body, 'requête');
  res.json(await service.rejectRequest(actorOf(req), id, input.note));
}

export async function completeRequest(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(completePurchaseSchema, req.body, 'achat');
  res.json(await service.completeRequest(actorOf(req), id, input));
}

export async function cancelRequest(req: Request, res: Response) {
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(cancelPurchaseSchema, req.body ?? {}, 'requête');
  res.json(await service.cancelRequest(actorOf(req), id, input.note));
}
