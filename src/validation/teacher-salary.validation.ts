import { z } from 'zod';
import { teacherSalaryStatuses } from '../config/teacher-salaries';
import { uuidSchema } from './common.validation';
export const salaryMonthSchema = z.iso
  .date()
  .regex(/^[1-9]\d{3}-\d{2}-01$/)
  .refine((value) => value <= '9998-12-01');
export const generateTeacherSalarySchema = z.object({ salaryMonth: salaryMonthSchema }).strict();
export const teacherSalaryParamsSchema = z.object({ teacherId: uuidSchema });
export const teacherSalaryPaymentParamsSchema = z.object({ id: uuidSchema });
export const recordTeacherSalaryPaymentSchema = z
  .object({
    amount: z
      .union([z.string(), z.number()])
      .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value.trim()))
      .pipe(
        z
          .string()
          .regex(
            /^\d+(\.\d{1,2})?$/,
            'Amount must be a valid positive currency amount with up to 2 decimal places.'
          )
          .refine(
            (value) => Number(value) > 0 && Number.isFinite(Number(value)),
            'Amount must be greater than zero.'
          )
      ),
    paymentMethod: z.enum(['cash', 'bkash', 'nagad', 'rocket', 'other']),
    paymentDate: z.iso.date().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export const teacherSalaryListQuerySchema = z
  .object({
    salaryMonth: salaryMonthSchema.optional(),
    status: z.enum(teacherSalaryStatuses).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
