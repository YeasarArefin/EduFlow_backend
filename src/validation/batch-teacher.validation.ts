import { z } from "zod";

export const batchTeacherIdSchema = z.object({
  batchId: z.string().uuid(),
  teacherId: z.string().uuid(),
}).strict();

export const assignBatchTeacherSchema = z.object({
  teacherId: z.string().uuid(),
  isPrimary: z.boolean().optional().default(false),
}).strict();

export const updateBatchTeacherSchema = z.object({
  isPrimary: z.boolean(),
}).strict();
