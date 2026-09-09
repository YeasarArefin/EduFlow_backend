import { Router } from 'express';
import { teacherSalaryPermissions } from '../../config/teacher-salaries';
import {
  bulkGenerateTeacherSalariesController,
  generateTeacherSalaryController,
  listTeacherSalariesController,
  listTeacherSalaryPaymentsController,
  recordTeacherSalaryPaymentController,
  teacherSalaryHistoryController,
} from '../../controllers/teacher-salary.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
export const teacherSalaryRoutes = Router();
teacherSalaryRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
teacherSalaryRoutes.get(
  '/',
  requirePermission(teacherSalaryPermissions.view.key),
  listTeacherSalariesController
);
teacherSalaryRoutes.post(
  '/generate',
  requirePermission(teacherSalaryPermissions.generate.key),
  bulkGenerateTeacherSalariesController
);
teacherSalaryRoutes.post(
  '/teachers/:teacherId/generate',
  requirePermission(teacherSalaryPermissions.generate.key),
  generateTeacherSalaryController
);
teacherSalaryRoutes.get(
  '/teachers/:teacherId',
  requirePermission(teacherSalaryPermissions.view.key),
  teacherSalaryHistoryController
);
teacherSalaryRoutes.get(
  '/:id/payments',
  requirePermission(teacherSalaryPermissions.view.key),
  listTeacherSalaryPaymentsController
);
teacherSalaryRoutes.post(
  '/:id/payments',
  requirePermission(teacherSalaryPermissions.pay.key),
  recordTeacherSalaryPaymentController
);
