import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './audit.controller';

export const auditRouter = Router();

auditRouter.get('/', requirePermission('audit.view'), asyncHandler(controller.listAudit));
