import { z } from "zod";
import { studentFeeStatuses } from "../config/student-fees";
import { uuidSchema } from "./common.validation";

// A month is a date-only key, always represented by its first day.
export const feeMonthSchema = z.iso.date().regex(/^[1-9]\d{3}-\d{2}-01$/)
  .refine((value) => value <= "9998-12-01", "Fee month must be before year 9999.");
export const generateFeeSchema = z.object({ feeMonth: feeMonthSchema }).strict();
export const feeEnrollmentParamsSchema = z.object({ enrollmentId: uuidSchema });
export const feeStudentParamsSchema = z.object({ id: uuidSchema });
export const feeHistoryQuerySchema = z.object({
  feeMonth: feeMonthSchema.optional(),
  status: z.enum(studentFeeStatuses).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const feeListQuerySchema = feeHistoryQuerySchema.extend({ feeMonth: feeMonthSchema });
