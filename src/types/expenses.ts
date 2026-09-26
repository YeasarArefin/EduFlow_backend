import type { expenseCategories, expenses } from '../database/schema/expenses';
import type { z } from 'zod';
import type {
  createExpenseCategorySchema,
  createExpenseSchema,
  expenseListQuerySchema,
  financialOverviewQuerySchema,
  reverseExpenseSchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
} from '../validation/expense.validation';

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type ExpenseRecord = typeof expenses.$inferSelect;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ReverseExpenseInput = z.infer<typeof reverseExpenseSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export type FinancialOverviewQuery = z.infer<typeof financialOverviewQuerySchema>;
