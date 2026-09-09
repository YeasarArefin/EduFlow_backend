import { z } from 'zod';
import { studentPaymentMethods } from '../config/student-fees';
import { uuidSchema } from './common.validation';

export const paymentAmountSchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value.trim()))
  .pipe(
    z
      .string()
      .regex(
        /^\d+(\.\d{1,2})?$/,
        'Amount must be a valid positive currency amount with up to 2 decimal places.'
      )
      .refine((value) => {
        const num = Number(value);
        return num > 0 && Number.isFinite(num);
      }, 'Amount must be greater than zero.')
  );

export const recordStudentPaymentSchema = z
  .object({
    amount: paymentAmountSchema,
    paymentMethod: z.enum(studentPaymentMethods),
    paymentDate: z.iso.date().optional(),
    receiptNumber: z.string().trim().min(1).max(50).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const feePaymentParamsSchema = z.object({
  id: uuidSchema,
});

export const studentPaymentParamsSchema = z.object({
  id: uuidSchema,
});

export const receiptParamsSchema = z.object({
  receiptNumber: z.string().trim().min(1).max(50),
});

export const studentPaymentHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    paymentMethod: z.enum(studentPaymentMethods).optional(),
  })
  .strict();
