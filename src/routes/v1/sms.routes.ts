import { Router } from 'express';
import {
  getSmsMessageDeliveryController,
  listSmsMessagesController,
  previewSms,
  queueSmsMessageController,
  retryFailedSmsRecipientsController,
} from '../../controllers/sms.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
import { requireWorkspaceOwner } from '../../middleware/require-workspace-owner';
export const smsRoutes = Router();
smsRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceOwner);
smsRoutes.post('/preview', previewSms);
smsRoutes.post('/messages', queueSmsMessageController);
smsRoutes.get('/messages', listSmsMessagesController);
smsRoutes.get('/messages/:id', getSmsMessageDeliveryController);
smsRoutes.post('/messages/:id/retry-failed', retryFailedSmsRecipientsController);
