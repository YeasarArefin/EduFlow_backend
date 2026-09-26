import { Router } from 'express';
import { expensePermissions } from '../../config/expenses';
import {
  createExpenseCategoryController,
  createExpenseController,
  financialOverviewController,
  listExpenseCategoriesController,
  listExpensesController,
  reverseExpenseController,
  updateExpenseCategoryController,
  updateExpenseController,
} from '../../controllers/expense.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-permission';
import { requireWorkspaceSubscriptionAccess } from '../../middleware/require-subscription-access';
import { requireWorkspaceContext } from '../../middleware/require-workspace-context';

export const expenseRoutes = Router();
expenseRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
expenseRoutes.get(
  '/finance/overview',
  requirePermission(expensePermissions.view.key),
  financialOverviewController
);
expenseRoutes.get(
  '/categories',
  requirePermission(expensePermissions.view.key),
  listExpenseCategoriesController
);
expenseRoutes.post(
  '/categories',
  requirePermission(expensePermissions.manage.key),
  createExpenseCategoryController
);
expenseRoutes.patch(
  '/categories/:id',
  requirePermission(expensePermissions.manage.key),
  updateExpenseCategoryController
);
expenseRoutes.get('/', requirePermission(expensePermissions.view.key), listExpensesController);
expenseRoutes.post('/', requirePermission(expensePermissions.manage.key), createExpenseController);
expenseRoutes.patch(
  '/:id',
  requirePermission(expensePermissions.manage.key),
  updateExpenseController
);
expenseRoutes.post(
  '/:id/reverse',
  requirePermission(expensePermissions.reverse.key),
  reverseExpenseController
);
