import { Router } from 'express';
import { studentFeePermissions } from '../../config/student-fees';
import { studentFeeHistoryController } from '../../controllers/student-fee.controller';
import { listStudentPaymentsController } from '../../controllers/student-payment.controller';
import {
  archiveStudentController,
  createStudentController,
  getStudentController,
  listStudentEnrollmentsController,
  listStudentsController,
  updateStudentController,
  studentImportTemplateController,
  previewStudentImportController,
  importStudentsController,
} from '../../controllers/student.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';

export const studentRoutes = Router();
studentRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
studentRoutes.get('/', requirePermission('students.view'), listStudentsController);
studentRoutes.post('/', requirePermission('students.create'), createStudentController);
studentRoutes.get('/import/template', requirePermission('students.create'), studentImportTemplateController);
studentRoutes.post('/import/preview', requirePermission('students.create'), previewStudentImportController);
studentRoutes.post('/import', requirePermission('students.create'), importStudentsController);
studentRoutes.get(
  '/:id/enrollments',
  requirePermission('students.view'),
  listStudentEnrollmentsController
);
studentRoutes.get(
  '/:id/fees',
  requirePermission(studentFeePermissions.view.key),
  studentFeeHistoryController
);
studentRoutes.get(
  '/:id/payments',
  requirePermission(studentFeePermissions.view.key),
  listStudentPaymentsController
);
studentRoutes.get('/:id', requirePermission('students.view'), getStudentController);
studentRoutes.patch('/:id', requirePermission('students.update'), updateStudentController);
studentRoutes.delete('/:id', requirePermission('students.archive'), archiveStudentController);
