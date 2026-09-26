import type { RequestHandler } from 'express';
import { getSmsWalletSummary, listSmsWalletHistory } from '../services/sms-wallet.service';
import { smsWalletHistoryQuerySchema } from '../validation/sms-wallet.validation';

export const getSmsWalletSummaryController: RequestHandler = async (req, res) => {
  res.json({ data: await getSmsWalletSummary(req.workspaceContext!.workspaceId) });
};

export const listSmsWalletHistoryController: RequestHandler = async (req, res) => {
  res.json(
    await listSmsWalletHistory(
      req.workspaceContext!.workspaceId,
      smsWalletHistoryQuerySchema.parse(req.query)
    )
  );
};
