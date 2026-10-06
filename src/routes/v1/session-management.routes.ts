import { Router } from 'express';
import {
  activeDevicesController,
  listActiveSessionsController,
  revokeOtherSessionsController,
  revokeSessionController,
  sessionTakeoverController,
} from '../../controllers/session-management.controller';
import { requireAuth } from '../../middleware/require-auth';

export const sessionManagementRoutes = Router();

// Public session resolution routes
sessionManagementRoutes.post('/takeover', sessionTakeoverController);
sessionManagementRoutes.post('/active-devices', activeDevicesController);

// Protected session management routes
sessionManagementRoutes.use(requireAuth);
sessionManagementRoutes.get('/', listActiveSessionsController);
sessionManagementRoutes.delete('/other', revokeOtherSessionsController);
sessionManagementRoutes.delete('/:sessionId', revokeSessionController);
