import { Router } from 'express';
import {
  getSmsWalletSummaryController,
  listSmsWalletHistoryController,
} from '../../controllers/sms-wallet.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';
import { requireWorkspaceOwner } from '../../middleware/require-workspace-owner';

export const smsWalletRoutes = Router();

smsWalletRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceOwner);
smsWalletRoutes.get('/', getSmsWalletSummaryController);
smsWalletRoutes.get('/history', listSmsWalletHistoryController);
