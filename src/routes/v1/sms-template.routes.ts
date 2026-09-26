import { Router } from 'express';
import {
  createSmsTemplateController,
  listSmsTemplatesController,
  previewSmsTemplateController,
  updateSmsTemplateController,
} from '../../controllers/sms-template.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
import { requireWorkspaceOwner } from '../../middleware/require-workspace-owner';
export const smsTemplateRoutes = Router();
smsTemplateRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceOwner);
smsTemplateRoutes.get('/templates', listSmsTemplatesController);
smsTemplateRoutes.post('/templates', createSmsTemplateController);
smsTemplateRoutes.patch('/templates/:id', updateSmsTemplateController);
smsTemplateRoutes.post('/templates/preview', previewSmsTemplateController);
