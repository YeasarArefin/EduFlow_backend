import { z } from "zod";
const status = z.enum(["active", "inactive", "completed", "cancelled", "archived"]);
const minor = z.coerce.bigint().min(0n).nullable().optional();
export const enrollmentParamsSchema = z.object({ batchId: z.string().uuid(), enrollmentId: z.string().uuid().optional() }).strict();
export const enrollStudentSchema = z.object({ studentId: z.string().uuid(), joinedAt: z.iso.date().optional(), feeOverrideMinor: minor, discountMinor: minor }).strict();
export const updateEnrollmentSchema = z.object({ status: status.optional(), joinedAt: z.iso.date().optional(), feeOverrideMinor: minor, discountMinor: minor }).strict().refine((value) => Object.keys(value).length > 0);
