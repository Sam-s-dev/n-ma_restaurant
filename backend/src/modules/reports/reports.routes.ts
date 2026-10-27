import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './reports.controller';

/** Rapports et exports, réservés au gérant. */
export const reportsRouter = Router();

reportsRouter.use(requirePermission('reports.export'));

reportsRouter.get('/summary', asyncHandler(controller.summary));
reportsRouter.get('/export.xlsx', audited('report.exported'), asyncHandler(controller.exportXlsx));
