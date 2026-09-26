import { z } from 'zod';
export const smsTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60),
    body: z.string().trim().min(1).max(10000),
    isActive: z.boolean().default(true),
  })
  .strict();
export const smsTemplatePreviewSchema = z
  .object({
    body: z.string().trim().min(1).max(10000),
    values: z.record(z.string(), z.string()).default({}),
  })
  .strict();
