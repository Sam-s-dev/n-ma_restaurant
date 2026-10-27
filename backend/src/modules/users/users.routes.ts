import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import { audited } from '../../middlewares/audit';
import { requirePermission } from '../../middlewares/auth';
import * as controller from './users.controller';

export const usersRouter = Router();

usersRouter.use(requirePermission('team.manage'));

usersRouter.get('/', asyncHandler(controller.listMembers));
usersRouter.post('/', audited('member.created'), asyncHandler(controller.createMember));
usersRouter.patch('/:id', audited('member.updated'), asyncHandler(controller.updateMember));
usersRouter.delete('/:id', audited('member.removed'), asyncHandler(controller.removeMember));

usersRouter.get('/invitations/list', asyncHandler(controller.listInvitations));
usersRouter.post('/invitations', asyncHandler(controller.invite));
usersRouter.delete('/invitations/:id', asyncHandler(controller.revokeInvitation));
