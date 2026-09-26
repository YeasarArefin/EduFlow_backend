import type { RequestHandler } from 'express';
import {
  createExpense,
  createExpenseCategory,
  getFinancialOverview,
  listExpenseCategories,
  listExpenses,
  reverseExpense,
  updateExpense,
  updateExpenseCategory,
} from '../services/expense.service';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  expenseCategoryIdParamsSchema,
  expenseIdParamsSchema,
  expenseListQuerySchema,
  financialOverviewQuerySchema,
  reverseExpenseSchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
} from '../validation/expense.validation';

export const listExpenseCategoriesController: RequestHandler = async (req, res) => {
  res.json(await listExpenseCategories(req.workspaceContext!.workspaceId));
};
export const createExpenseCategoryController: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json({
      data: await createExpenseCategory(
        req.workspaceContext!.workspaceId,
        req.authenticatedUser!.id,
        createExpenseCategorySchema.parse(req.body)
      ),
    });
};
export const updateExpenseCategoryController: RequestHandler = async (req, res) => {
  const { id } = expenseCategoryIdParamsSchema.parse(req.params);
  res.json({
    data: await updateExpenseCategory(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      id,
      updateExpenseCategorySchema.parse(req.body)
    ),
  });
};
export const listExpensesController: RequestHandler = async (req, res) => {
  res.json(
    await listExpenses(req.workspaceContext!.workspaceId, expenseListQuerySchema.parse(req.query))
  );
};
export const createExpenseController: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json({
      data: await createExpense(
        req.workspaceContext!.workspaceId,
        req.authenticatedUser!.id,
        createExpenseSchema.parse(req.body)
      ),
    });
};
export const updateExpenseController: RequestHandler = async (req, res) => {
  const { id } = expenseIdParamsSchema.parse(req.params);
  res.json({
    data: await updateExpense(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      id,
      updateExpenseSchema.parse(req.body)
    ),
  });
};
export const reverseExpenseController: RequestHandler = async (req, res) => {
  const { id } = expenseIdParamsSchema.parse(req.params);
  res.json({
    data: await reverseExpense(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      id,
      reverseExpenseSchema.parse(req.body)
    ),
  });
};
export const financialOverviewController: RequestHandler = async (req, res) => {
  res.json({
    data: await getFinancialOverview(
      req.workspaceContext!.workspaceId,
      financialOverviewQuerySchema.parse(req.query)
    ),
  });
};
