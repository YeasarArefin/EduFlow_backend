import { Router } from 'express';
import { attendancePermissions } from '../../config/attendance';
import {
  createAttendanceSessionController,
  finalizeAttendanceSessionController,
  getAttendanceSessionController,
  listAttendanceSessionsController,
  saveAttendanceController,
} from '../../controllers/attendance.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';

export const attendanceRoutes = Router();
attendanceRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
attendanceRoutes.get(
  '/',
  requirePermission(attendancePermissions.view.key),
  listAttendanceSessionsController
);
attendanceRoutes.post(
  '/',
  requirePermission(attendancePermissions.mark.key),
  createAttendanceSessionController
);
attendanceRoutes.get(
  '/:id',
  requirePermission(attendancePermissions.view.key),
  getAttendanceSessionController
);
attendanceRoutes.patch(
  '/:id/records',
  requirePermission(attendancePermissions.update.key),
  saveAttendanceController
);
attendanceRoutes.post(
  '/:id/finalize',
  requirePermission(attendancePermissions.finalize.key),
  finalizeAttendanceSessionController
);
