import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './staff.controller';

export const staffRouter = Router();

// Pointage collectif et vue d'ensemble des salaires (§4)
staffRouter.get('/attendances', asyncHandler(controller.listAttendances));
staffRouter.post('/attendances', asyncHandler(controller.markAttendanceBulk));
staffRouter.get('/salaries/overview', asyncHandler(controller.salaryOverview));

// Fiches employés
staffRouter.get('/', asyncHandler(controller.listEmployees));
staffRouter.post('/', asyncHandler(controller.createEmployee));
staffRouter.get('/:id', asyncHandler(controller.getEmployee));
staffRouter.patch('/:id', asyncHandler(controller.updateEmployee));
staffRouter.delete('/:id', asyncHandler(controller.deleteEmployee));

// Pointage individuel
staffRouter.get('/:id/attendances', asyncHandler(controller.employeeAttendances));
staffRouter.post('/:id/attendances', asyncHandler(controller.markAttendance));

// Salaire : solde, historique, paiement (§4, §10)
staffRouter.get('/:id/salary', asyncHandler(controller.salaryDetail));
staffRouter.post('/:id/salary/payments', asyncHandler(controller.paySalary));
staffRouter.post(
  '/:id/salary/payments/:paymentId/cancel',
  asyncHandler(controller.cancelSalaryPayment),
);
