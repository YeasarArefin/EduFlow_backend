import { Router } from 'express';
import { createNoticeController, getNoticeDetailController, getNoticeProgressController, listNoticeRecipientsController, listNoticesController, previewNoticeRecipientsController, processNoticeBatchController, queueNoticeRecipientsController, retryFailedNoticeRecipientsController } from '../../controllers/notice.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
import { requireWorkspaceOwner } from '../../middleware/require-workspace-owner';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';

export const noticeRoutes = Router();
noticeRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess, requireWorkspaceOwner);
noticeRoutes.post('/', createNoticeController);
noticeRoutes.get('/', listNoticesController);
noticeRoutes.get('/:id/preview', previewNoticeRecipientsController);
noticeRoutes.post('/:id/queue', queueNoticeRecipientsController);
noticeRoutes.post('/:id/process-next-batch', processNoticeBatchController);
noticeRoutes.post('/:id/retry-failed', retryFailedNoticeRecipientsController);
noticeRoutes.get('/:id/progress', getNoticeProgressController);
noticeRoutes.get('/:id/recipients', listNoticeRecipientsController);
noticeRoutes.get('/:id', getNoticeDetailController);
