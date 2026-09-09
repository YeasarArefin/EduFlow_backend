import { Router } from 'express';
import {
  getWorkspaceSettingsController,
  updateWorkspaceSettingsController,
} from '../../controllers/workspace-settings.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
import { requireWorkspaceOwner } from '../../middleware/require-workspace-owner';
export const workspaceSettingsRoutes = Router();
workspaceSettingsRoutes.use(
  requireAuth,
  requireWorkspaceContext,
  requireWorkspaceSubscriptionAccess,
  requireWorkspaceOwner
);
workspaceSettingsRoutes.get('/', getWorkspaceSettingsController);
workspaceSettingsRoutes.patch('/', updateWorkspaceSettingsController);
