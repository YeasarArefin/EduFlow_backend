import { Router } from 'express';
import { listActiveSessionsController, revokeOtherSessionsController, revokeSessionController } from '../../controllers/session-management.controller';
import { requireAuth } from '../../middleware/require-auth';

export const sessionManagementRoutes = Router();
sessionManagementRoutes.use(requireAuth);
sessionManagementRoutes.get('/', listActiveSessionsController);
sessionManagementRoutes.delete('/other', revokeOtherSessionsController);
sessionManagementRoutes.delete('/:sessionId', revokeSessionController);
