import { z } from 'zod';
import { expensePaymentMethods } from '../config/expenses';
import { uuidSchema } from './common.validation';

const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value.trim()))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Amount must have at most two decimal places.')
      .refine(
        (value) => Number(value) > 0 && Number.isFinite(Number(value)),
        'Amount must be greater than zero.'
      )
  );
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const expenseIdParamsSchema = z.object({ id: uuidSchema }).strict();
export const expenseCategoryIdParamsSchema = z.object({ id: uuidSchema }).strict();
export const createExpenseCategorySchema = z
  .object({ name: z.string().trim().min(1).max(100), description: optionalText(500) })
  .strict();
export const updateExpenseCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: optionalText(500),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    'At least one field must be changed.'
  );
export const createExpenseSchema = z
  .object({
    categoryId: uuidSchema,
    title: z.string().trim().min(1).max(180),
    amount: moneySchema,
    expenseDate: z.iso.date(),
    paymentMethod: z.enum(expensePaymentMethods),
    description: optionalText(2_000),
  })
  .strict();
export const updateExpenseSchema = z
  .object({
    categoryId: uuidSchema.optional(),
    title: z.string().trim().min(1).max(180).optional(),
    amount: moneySchema.optional(),
    expenseDate: z.iso.date().optional(),
    paymentMethod: z.enum(expensePaymentMethods).optional(),
    description: optionalText(2_000),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    'At least one field must be changed.'
  );
export const reverseExpenseSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export const expenseListQuerySchema = z
  .object({
    categoryId: uuidSchema.optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    status: z.enum(['active', 'reversed']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
    'Start date must be before end date.'
  );
export const financialOverviewQuerySchema = z
  .object({ startDate: z.iso.date().optional(), endDate: z.iso.date().optional() })
  .strict()
  .refine(
    (value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
    'Start date must be before end date.'
  );
