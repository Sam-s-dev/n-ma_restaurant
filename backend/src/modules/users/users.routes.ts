import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler';
import * as controller from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', asyncHandler(controller.listMembers));
usersRouter.post('/', asyncHandler(controller.createMember));
usersRouter.patch('/:id', asyncHandler(controller.updateMember));
usersRouter.delete('/:id', asyncHandler(controller.removeMember));

usersRouter.get('/invitations/list', asyncHandler(controller.listInvitations));
usersRouter.post('/invitations', asyncHandler(controller.invite));
usersRouter.delete('/invitations/:id', asyncHandler(controller.revokeInvitation));
