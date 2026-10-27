import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './staff.controller';

export const staffRouter = Router();

staffRouter.use(requirePermission('staff.manage'));

// Pointage collectif et vue d'ensemble des salaires (§4)
staffRouter.get('/attendances', asyncHandler(controller.listAttendances));
staffRouter.post('/attendances', asyncHandler(controller.markAttendanceBulk));
staffRouter.get('/salaries/overview', asyncHandler(controller.salaryOverview));

// Fiches employés
staffRouter.get('/', asyncHandler(controller.listEmployees));
staffRouter.post('/', audited('employee.created'), asyncHandler(controller.createEmployee));
staffRouter.get('/:id', asyncHandler(controller.getEmployee));
staffRouter.patch('/:id', audited('employee.updated'), asyncHandler(controller.updateEmployee));
staffRouter.delete('/:id', audited('employee.deleted'), asyncHandler(controller.deleteEmployee));

// Pointage individuel
staffRouter.get('/:id/attendances', asyncHandler(controller.employeeAttendances));
staffRouter.post('/:id/attendances', asyncHandler(controller.markAttendance));

// Activités : retards, absences, avertissements, félicitations, notes
staffRouter.get('/:id/activity', asyncHandler(controller.listActivity));
staffRouter.post('/:id/notes', audited('employee.noted'), asyncHandler(controller.addNote));

// Salaire : solde, historique, paiement (§4, §10)
staffRouter.get('/:id/salary', asyncHandler(controller.salaryDetail));
staffRouter.post('/:id/salary/payments', audited('salary.paid'), asyncHandler(controller.paySalary));
staffRouter.post(
  '/:id/salary/payments/:paymentId/cancel',
  audited('salary.cancelled'),
  asyncHandler(controller.cancelSalaryPayment),
);
