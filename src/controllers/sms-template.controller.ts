import type { RequestHandler } from 'express';
import {
  createSmsTemplate,
  listSmsTemplates,
  renderSmsTemplate,
  updateSmsTemplate,
} from '../services/sms-template.service';
import { smsTemplatePreviewSchema, smsTemplateSchema } from '../validation/sms-template.validation';
export const listSmsTemplatesController: RequestHandler = async (req, res) =>
  res.json({ data: await listSmsTemplates(req.workspaceContext!.workspaceId) });
export const createSmsTemplateController: RequestHandler = async (req, res) =>
  res.status(201).json({
    data: await createSmsTemplate(
      req.workspaceContext!.workspaceId,
      smsTemplateSchema.parse(req.body)
    ),
  });
export const updateSmsTemplateController: RequestHandler = async (req, res) =>
  res.json({
    data: await updateSmsTemplate(
      req.workspaceContext!.workspaceId,
      req.params.id as string,
      smsTemplateSchema.partial().parse(req.body)
    ),
  });
export const previewSmsTemplateController: RequestHandler = (req, res) => {
  const input = smsTemplatePreviewSchema.parse(req.body);
  res.json({ data: { body: renderSmsTemplate(input.body, input.values) } });
};
