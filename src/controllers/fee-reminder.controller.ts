import type { RequestHandler } from 'express';
import { processFeeReminders } from '../services/fee-reminder.service';
export const processFeeRemindersController: RequestHandler = async (req, res) =>
  res.json({ data: await processFeeReminders(req.workspaceContext!.workspaceId) });
