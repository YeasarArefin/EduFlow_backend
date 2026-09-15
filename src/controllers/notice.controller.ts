import type { RequestHandler } from 'express';
import { createNotice, getNoticeDetail, getNoticeProgress, listNoticeRecipients, listNotices, previewNoticeRecipients, processNextNoticeBatch, queueNoticeRecipients, retryFailedNoticeRecipients } from '../services/notice.service';
import { createNoticeSchema, noticeIdParamsSchema, noticeListQuerySchema, noticeRecipientsQuerySchema, processNoticeBatchSchema } from '../validation/notice.validation';

export const createNoticeController: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await createNotice(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, createNoticeSchema.parse(req.body)) });
};
export const previewNoticeRecipientsController: RequestHandler = async (req, res) => {
  const { id } = noticeIdParamsSchema.parse(req.params);
  res.json({ data: await previewNoticeRecipients(req.workspaceContext!.workspaceId, id) });
};
export const queueNoticeRecipientsController: RequestHandler = async (req, res) => {
  const { id } = noticeIdParamsSchema.parse(req.params);
  res.json({ data: await queueNoticeRecipients(req.workspaceContext!.workspaceId, id) });
};
export const processNoticeBatchController: RequestHandler = async (req, res) => {
  const { id } = noticeIdParamsSchema.parse(req.params);
  res.json({ data: await processNextNoticeBatch(req.workspaceContext!.workspaceId, id, processNoticeBatchSchema.parse(req.body ?? {})) });
};
export const retryFailedNoticeRecipientsController: RequestHandler = async (req, res) => {
  const { id } = noticeIdParamsSchema.parse(req.params);
  res.json({ data: await retryFailedNoticeRecipients(req.workspaceContext!.workspaceId, id) });
};
export const getNoticeProgressController: RequestHandler = async (req, res) => {
  const { id } = noticeIdParamsSchema.parse(req.params);
  res.json({ data: await getNoticeProgress(req.workspaceContext!.workspaceId, id) });
};
export const listNoticesController: RequestHandler = async (req, res) => {
  const result = await listNotices(req.workspaceContext!.workspaceId, noticeListQuerySchema.parse(req.query));
  res.json(result);
};
export const getNoticeDetailController: RequestHandler = async (req, res) => {
  const { id } = noticeIdParamsSchema.parse(req.params);
  res.json({ data: await getNoticeDetail(req.workspaceContext!.workspaceId, id) });
};
export const listNoticeRecipientsController: RequestHandler = async (req, res) => {
  const { id } = noticeIdParamsSchema.parse(req.params);
  res.json({ data: await listNoticeRecipients(req.workspaceContext!.workspaceId, id, noticeRecipientsQuerySchema.parse(req.query)) });
};
