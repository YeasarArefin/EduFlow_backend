import { Router } from 'express';
import {
  archiveTeacherController,
  createTeacherController,
  getTeacherController,
  listTeachersController,
  updateTeacherController,
  teacherImportTemplateController,
  previewTeacherImportController,
  importTeachersController,
} from '../../controllers/teacher.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
export const teacherRoutes = Router();
teacherRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
teacherRoutes.get('/', requirePermission('students.view'), listTeachersController);
teacherRoutes.post('/', requirePermission('students.create'), createTeacherController);
teacherRoutes.get('/import/template', requirePermission('students.create'), teacherImportTemplateController);
teacherRoutes.post('/import/preview', requirePermission('students.create'), previewTeacherImportController);
teacherRoutes.post('/import', requirePermission('students.create'), importTeachersController);
teacherRoutes.get('/:id', requirePermission('students.view'), getTeacherController);
teacherRoutes.patch('/:id', requirePermission('students.update'), updateTeacherController);
teacherRoutes.delete('/:id', requirePermission('students.archive'), archiveTeacherController);
