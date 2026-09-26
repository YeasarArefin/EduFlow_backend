import { Router } from 'express';
import { processFeeRemindersController } from '../../controllers/fee-reminder.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
import { requireWorkspaceOwner } from '../../middleware/require-workspace-owner';
export const feeReminderRoutes = Router();
feeReminderRoutes.post(
  '/process',
  requireAuth,
  requireWorkspaceContext,
  requireWorkspaceOwner,
  processFeeRemindersController
);
