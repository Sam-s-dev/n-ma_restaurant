import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './customers.service';
import {
  createCustomerSchema,
  listCustomersSchema,
  updateCustomerSchema,
} from './customers.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant invalide.') });

export async function listCustomers(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listCustomersSchema, req.query, 'requête');
  res.json(await service.listCustomers(user.restaurantId, input));
}

export async function getCustomer(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getCustomer(user.restaurantId, id));
}

export async function createCustomer(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createCustomerSchema, req.body, 'client');
  res.status(201).json(await service.createCustomer(user.restaurantId, input));
}

export async function updateCustomer(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(updateCustomerSchema, req.body, 'client');
  res.json(await service.updateCustomer(user.restaurantId, id, input));
}

export async function deleteCustomer(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  await service.deleteCustomer(user.restaurantId, id);
  res.status(204).send();
}
