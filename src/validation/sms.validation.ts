import { z } from 'zod';

const phone = z.string().trim().min(6).max(30);
export const smsPreviewSchema = z
  .object({
    message: z.string().trim().min(1).max(10000),
    recipientCount: z.number().int().min(1).max(100000),
  })
  .strict();
export const queueSmsMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(10000),
    target: z.enum(['student', 'guardian', 'both']).default('student'),
    studentIds: z.array(z.uuid()).max(10000).optional(),
    customNumbers: z.array(phone).max(10000).optional(),
  })
  .strict()
  .refine((value) => (value.studentIds?.length ?? 0) + (value.customNumbers?.length ?? 0) > 0, {
    message: 'Select at least one student or enter a custom number.',
  });
