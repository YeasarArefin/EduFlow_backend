import { z } from 'zod';
import { uuidSchema } from './common.validation';

export const noticeAudienceSchema = z.enum(['batch', 'all_students', 'all_teachers', 'everyone']);
export const createNoticeSchema = z.object({
  audience: noticeAudienceSchema,
  batchId: uuidSchema.optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
}).strict().superRefine((value, ctx) => {
  if (value.audience === 'batch' && !value.batchId) ctx.addIssue({ code: 'custom', path: ['batchId'], message: 'A batch is required for a batch notice.' });
  if (value.audience !== 'batch' && value.batchId) ctx.addIssue({ code: 'custom', path: ['batchId'], message: 'Batch may only be supplied for a batch notice.' });
});

export const noticeIdParamsSchema = z.object({ id: uuidSchema }).strict();
export const processNoticeBatchSchema = z.object({ limit: z.coerce.number().int().min(25).max(50).default(25) }).strict();
export const noticeListQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const noticeRecipientsQuerySchema = z.object({ status: z.enum(['failed', 'skipped']).default('failed') }).strict();
