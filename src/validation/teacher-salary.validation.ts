import { z } from "zod";
import { teacherSalaryStatuses } from "../config/teacher-salaries";
import { uuidSchema } from "./common.validation";
export const salaryMonthSchema = z.iso.date().regex(/^[1-9]\d{3}-\d{2}-01$/).refine((value) => value <= "9998-12-01");
export const generateTeacherSalarySchema = z.object({ salaryMonth: salaryMonthSchema }).strict();
export const teacherSalaryParamsSchema = z.object({ teacherId: uuidSchema });
export const teacherSalaryListQuerySchema = z.object({ salaryMonth: salaryMonthSchema.optional(), status: z.enum(teacherSalaryStatuses).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
