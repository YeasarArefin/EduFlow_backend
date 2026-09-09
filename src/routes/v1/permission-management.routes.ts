import { Router } from 'express';
import {
  createRoleController,
  deleteRoleController,
  getMemberPermissionOverridesController,
  getPermissionConfigurationController,
  resetMemberPermissionOverridesController,
  updateMemberPermissionOverridesController,
  updateRoleController,
} from '../../controllers/permission-management.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
import { requireWorkspaceOwner } from '../../middleware/require-workspace-owner';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';
export const permissionManagementRoutes = Router();
permissionManagementRoutes.use(
  requireAuth,
  requireWorkspaceContext,
  requireWorkspaceSubscriptionAccess,
  requireWorkspaceOwner
);
permissionManagementRoutes.get('/', getPermissionConfigurationController);
permissionManagementRoutes.post('/roles', createRoleController);
permissionManagementRoutes.patch('/roles/:roleId', updateRoleController);
permissionManagementRoutes.delete('/roles/:roleId', deleteRoleController);
permissionManagementRoutes.get('/members/:memberId', getMemberPermissionOverridesController);
permissionManagementRoutes.patch('/members/:memberId', updateMemberPermissionOverridesController);
permissionManagementRoutes.delete('/members/:memberId', resetMemberPermissionOverridesController);
