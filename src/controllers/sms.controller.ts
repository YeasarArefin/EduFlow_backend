import type { RequestHandler } from 'express';
import { calculateSmsSegments } from '../services/sms-segment.service';
import {
  getSmsMessageDelivery,
  listSmsMessages,
  queueSmsMessage,
  retryFailedSmsRecipients,
} from '../services/sms-queue.service';
import { queueSmsMessageSchema, smsPreviewSchema } from '../validation/sms.validation';

export const previewSms: RequestHandler = (req, res) => {
  const input = smsPreviewSchema.parse(req.body);
  res.json({ data: calculateSmsSegments(input.message, input.recipientCount) });
};
export const queueSmsMessageController: RequestHandler = async (req, res) => {
  const input = queueSmsMessageSchema.parse(req.body);
  const data = await queueSmsMessage(req.workspaceContext!.workspaceId, {
    ...input,
    actorUserId: req.authenticatedUser!.id,
  });
  res.status(201).json({ data });
};
export const listSmsMessagesController: RequestHandler = async (req, res) =>
  res.json({ data: await listSmsMessages(req.workspaceContext!.workspaceId) });
export const getSmsMessageDeliveryController: RequestHandler = async (req, res) =>
  res.json({
    data: await getSmsMessageDelivery(req.workspaceContext!.workspaceId, req.params.id as string),
  });
export const retryFailedSmsRecipientsController: RequestHandler = async (req, res) =>
  res.json({
    data: await retryFailedSmsRecipients(
      req.workspaceContext!.workspaceId,
      req.params.id as string
    ),
  });
