import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../core/validate';
import { currentUser } from '../../middlewares/auth';
import * as service from './staff.service';
import {
  attendanceRangeSchema,
  bulkAttendanceSchema,
  createEmployeeNoteSchema,
  createEmployeeSchema,
  listEmployeesSchema,
  markAttendanceSchema,
  paySalarySchema,
  updateEmployeeSchema,
} from './staff.schemas';

const idParam = z.object({ id: z.string().uuid('Identifiant invalide.') });
const paymentParams = z.object({
  id: z.string().uuid('Identifiant employé invalide.'),
  paymentId: z.string().uuid('Identifiant de paiement invalide.'),
});
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(255) });

// --- Activités -----------------------------------------------------------

export async function listActivity(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json({ items: await service.listEmployeeActivity(user.restaurantId, id) });
}

export async function addNote(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(createEmployeeNoteSchema, req.body, 'note');
  res.status(201).json(await service.addEmployeeNote(user.restaurantId, id, user.id, input));
}

// --- Fiches employés -----------------------------------------------------

export async function listEmployees(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(listEmployeesSchema, req.query, 'requête');
  res.json({ items: await service.listEmployees(user.restaurantId, input) });
}

export async function getEmployee(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json(await service.getEmployee(user.restaurantId, id));
}

export async function createEmployee(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(createEmployeeSchema, req.body, 'employé');
  res.status(201).json(await service.createEmployee(user.restaurantId, input));
}

export async function updateEmployee(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(updateEmployeeSchema, req.body, 'employé');
  res.json(await service.updateEmployee(user.restaurantId, id, input));
}

export async function deleteEmployee(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  await service.deleteEmployee(user.restaurantId, id);
  res.status(204).send();
}

// --- Pointage ------------------------------------------------------------

export async function markAttendance(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(markAttendanceSchema, req.body, 'pointage');
  res.status(201).json(await service.markAttendance(user.restaurantId, id, user.id, input));
}

export async function markAttendanceBulk(req: Request, res: Response) {
  const user = currentUser(req);
  const input = parseOrThrow(bulkAttendanceSchema, req.body, 'pointage');
  res
    .status(201)
    .json({ items: await service.markAttendanceBulk(user.restaurantId, user.id, input) });
}

export async function listAttendances(req: Request, res: Response) {
  const user = currentUser(req);
  const range = parseOrThrow(attendanceRangeSchema, req.query, 'requête');
  const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
  res.json({
    items: await service.listAttendances(user.restaurantId, range.from, range.to, employeeId),
  });
}

export async function employeeAttendances(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const range = parseOrThrow(attendanceRangeSchema, req.query, 'requête');
  res.json({
    items: await service.listAttendances(user.restaurantId, range.from, range.to, id),
  });
}

// --- Salaires ------------------------------------------------------------

export async function salaryDetail(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  res.json({
    balance: await service.getSalaryBalance(user.restaurantId, id),
    payments: await service.listSalaryPayments(user.restaurantId, id),
  });
}

export async function paySalary(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parseOrThrow(idParam, req.params, 'requête');
  const input = parseOrThrow(paySalarySchema, req.body, 'paiement');
  res.status(201).json(await service.paySalary(user.restaurantId, id, user.id, input));
}

export async function cancelSalaryPayment(req: Request, res: Response) {
  const user = currentUser(req);
  const { id, paymentId } = parseOrThrow(paymentParams, req.params, 'requête');
  const input = parseOrThrow(cancelSchema, req.body, 'requête');
  res.json(
    await service.cancelSalaryPayment(user.restaurantId, id, paymentId, user.id, input.reason),
  );
}

export async function salaryOverview(req: Request, res: Response) {
  const user = currentUser(req);
  res.json(await service.salaryOverview(user.restaurantId));
}
