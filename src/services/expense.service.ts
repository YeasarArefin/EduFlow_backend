import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { expenseCategories, expenses } from '../database/schema/expenses';
import { AppError } from '../middleware/error-handler';
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ExpenseListQuery,
  FinancialOverviewQuery,
  ReverseExpenseInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from '../types/expenses';
import { recordAuditLog } from './audit-log.service';

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function localDateString(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function findCategory(
  transaction: Parameters<Parameters<typeof withWorkspaceContext>[1]>[0],
  workspaceId: string,
  categoryId: string
) {
  const [category] = await transaction
    .select()
    .from(expenseCategories)
    .where(
      and(eq(expenseCategories.id, categoryId), eq(expenseCategories.workspaceId, workspaceId))
    )
    .limit(1);
  if (!category)
    throw new AppError('EXPENSE_CATEGORY_NOT_FOUND', 'The expense category was not found.', 404);
  return category;
}

async function findExpense(
  transaction: Parameters<Parameters<typeof withWorkspaceContext>[1]>[0],
  workspaceId: string,
  expenseId: string
) {
  const [expense] = await transaction
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.workspaceId, workspaceId)))
    .limit(1);
  if (!expense) throw new AppError('EXPENSE_NOT_FOUND', 'The expense was not found.', 404);
  return expense;
}

export async function listExpenseCategories(workspaceId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => ({
    data: await transaction
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.workspaceId, workspaceId))
      .orderBy(expenseCategories.isActive, expenseCategories.name),
  }));
}

export async function createExpenseCategory(
  workspaceId: string,
  actorUserId: string,
  input: CreateExpenseCategoryInput
) {
  try {
    return await withWorkspaceContext(workspaceId, async (transaction) => {
      const [category] = await transaction
        .insert(expenseCategories)
        .values({ workspaceId, ...input })
        .returning();
      await recordAuditLog(transaction, {
        workspaceId,
        actorUserId,
        action: 'expenses.category_created',
        entityType: 'expense_categories',
        entityId: category.id,
        metadata: { name: category.name },
      });
      return category;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(
        'DUPLICATE_EXPENSE_CATEGORY',
        'A category with this name already exists.',
        409
      );
    throw error;
  }
}

export async function updateExpenseCategory(
  workspaceId: string,
  actorUserId: string,
  categoryId: string,
  input: UpdateExpenseCategoryInput
) {
  try {
    return await withWorkspaceContext(workspaceId, async (transaction) => {
      await findCategory(transaction, workspaceId, categoryId);
      const [category] = await transaction
        .update(expenseCategories)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(expenseCategories.id, categoryId), eq(expenseCategories.workspaceId, workspaceId))
        )
        .returning();
      await recordAuditLog(transaction, {
        workspaceId,
        actorUserId,
        action: 'expenses.category_updated',
        entityType: 'expense_categories',
        entityId: category.id,
        metadata: { changes: JSON.stringify(input) },
      });
      return category;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(
        'DUPLICATE_EXPENSE_CATEGORY',
        'A category with this name already exists.',
        409
      );
    throw error;
  }
}

export async function listExpenses(workspaceId: string, query: ExpenseListQuery) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const where = and(
      eq(expenses.workspaceId, workspaceId),
      query.categoryId ? eq(expenses.categoryId, query.categoryId) : undefined,
      query.status ? eq(expenses.status, query.status) : undefined,
      query.startDate ? gte(expenses.expenseDate, query.startDate) : undefined,
      query.endDate ? lte(expenses.expenseDate, query.endDate) : undefined
    );
    const [rows, totals] = await Promise.all([
      transaction
        .select({
          expense: expenses,
          category: { id: expenseCategories.id, name: expenseCategories.name },
        })
        .from(expenses)
        .innerJoin(
          expenseCategories,
          and(
            eq(expenseCategories.id, expenses.categoryId),
            eq(expenseCategories.workspaceId, workspaceId)
          )
        )
        .where(where)
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt), desc(expenses.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      transaction
        .select({
          total: count(),
          activeTotal: sql<string>`coalesce(sum(case when ${expenses.status} = 'active' then ${expenses.amount} else 0 end), 0)::text`,
        })
        .from(expenses)
        .where(where),
    ]);
    const total = Number(totals[0]?.total ?? 0);
    return {
      data: rows.map((row) => ({ ...row.expense, category: row.category })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        activeTotal: totals[0]?.activeTotal ?? '0.00',
      },
    };
  });
}

export async function createExpense(
  workspaceId: string,
  actorUserId: string,
  input: CreateExpenseInput
) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const category = await findCategory(transaction, workspaceId, input.categoryId);
    if (!category.isActive)
      throw new AppError('EXPENSE_CATEGORY_INACTIVE', 'Choose an active expense category.', 409);
    const [expense] = await transaction
      .insert(expenses)
      .values({ workspaceId, recordedByUserId: actorUserId, ...input })
      .returning();
    await recordAuditLog(transaction, {
      workspaceId,
      actorUserId,
      action: 'expenses.created',
      entityType: 'expenses',
      entityId: expense.id,
      metadata: {
        title: expense.title,
        amount: expense.amount,
        categoryId: expense.categoryId,
        expenseDate: expense.expenseDate,
      },
    });
    return expense;
  });
}

export async function updateExpense(
  workspaceId: string,
  actorUserId: string,
  expenseId: string,
  input: UpdateExpenseInput
) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const expense = await findExpense(transaction, workspaceId, expenseId);
    if (expense.status === 'reversed')
      throw new AppError('EXPENSE_REVERSED', 'A reversed expense cannot be edited.', 409);
    if (input.categoryId) {
      const category = await findCategory(transaction, workspaceId, input.categoryId);
      if (!category.isActive)
        throw new AppError('EXPENSE_CATEGORY_INACTIVE', 'Choose an active expense category.', 409);
    }
    const [updated] = await transaction
      .update(expenses)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.workspaceId, workspaceId),
          eq(expenses.status, 'active')
        )
      )
      .returning();
    await recordAuditLog(transaction, {
      workspaceId,
      actorUserId,
      action: 'expenses.updated',
      entityType: 'expenses',
      entityId: expenseId,
      metadata: {
        before: JSON.stringify({
          title: expense.title,
          amount: expense.amount,
          categoryId: expense.categoryId,
          expenseDate: expense.expenseDate,
        }),
        after: JSON.stringify(input),
      },
    });
    return updated;
  });
}

export async function reverseExpense(
  workspaceId: string,
  actorUserId: string,
  expenseId: string,
  input: ReverseExpenseInput
) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const expense = await findExpense(transaction, workspaceId, expenseId);
    if (expense.status === 'reversed')
      throw new AppError(
        'EXPENSE_ALREADY_REVERSED',
        'This expense has already been reversed.',
        409
      );
    const [reversed] = await transaction
      .update(expenses)
      .set({
        status: 'reversed',
        reversedAt: new Date(),
        reversedByUserId: actorUserId,
        reversalReason: input.reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.workspaceId, workspaceId),
          eq(expenses.status, 'active')
        )
      )
      .returning();
    await recordAuditLog(transaction, {
      workspaceId,
      actorUserId,
      action: 'expenses.reversed',
      entityType: 'expenses',
      entityId: expenseId,
      metadata: { title: expense.title, amount: expense.amount, reason: input.reason },
    });
    return reversed;
  });
}

export async function getFinancialOverview(workspaceId: string, query: FinancialOverviewQuery) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const now = new Date();
    const startDate =
      query.startDate ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = query.endDate ?? localDateString(now);
    const result = await transaction.execute<{
      collectedFees: string;
      paidTeacherSalaries: string;
      otherExpenses: string;
      categoryBreakdown: unknown;
      monthly: unknown;
    }>(sql`select
      (select coalesce(sum(amount), 0)::text from student_payments where workspace_id = ${workspaceId}::uuid and payment_date between ${startDate}::date and ${endDate}::date) as "collectedFees",
      (select coalesce(sum(amount), 0)::text from teacher_salary_payments where workspace_id = ${workspaceId}::uuid and payment_date between ${startDate}::date and ${endDate}::date) as "paidTeacherSalaries",
      (select coalesce(sum(amount), 0)::text from expenses where workspace_id = ${workspaceId}::uuid and status = 'active' and expense_date between ${startDate}::date and ${endDate}::date) as "otherExpenses",
      (select coalesce(json_agg(row_to_json(categories)), '[]'::json) from (select category.name, sum(expense.amount)::text as amount from expenses expense inner join expense_categories category on category.id = expense.category_id and category.workspace_id = expense.workspace_id where expense.workspace_id = ${workspaceId}::uuid and expense.status = 'active' and expense.expense_date between ${startDate}::date and ${endDate}::date group by category.name order by sum(expense.amount) desc) categories) as "categoryBreakdown",
      (select coalesce(json_agg(row_to_json(months) order by months.month), '[]'::json) from (
        select calendar.calendar_month::date as month,
          coalesce(fee.income, 0)::text as income,
          coalesce(salary.salaries, 0)::text as salaries,
          coalesce(expense.other_expenses, 0)::text as "otherExpenses"
        from generate_series(
          date_trunc('month', ${startDate}::date),
          date_trunc('month', ${endDate}::date),
          interval '1 month'
        ) as calendar(calendar_month)
        left join (
          select date_trunc('month', payment_date)::date as month, sum(amount) as income
          from student_payments
          where workspace_id = ${workspaceId}::uuid and payment_date between ${startDate}::date and ${endDate}::date
          group by 1
        ) fee on fee.month = calendar.calendar_month::date
        left join (
          select date_trunc('month', payment_date)::date as month, sum(amount) as salaries
          from teacher_salary_payments
          where workspace_id = ${workspaceId}::uuid and payment_date between ${startDate}::date and ${endDate}::date
          group by 1
        ) salary on salary.month = calendar.calendar_month::date
        left join (
          select date_trunc('month', expense_date)::date as month, sum(amount) as other_expenses
          from expenses
          where workspace_id = ${workspaceId}::uuid and status = 'active' and expense_date between ${startDate}::date and ${endDate}::date
          group by 1
        ) expense on expense.month = calendar.calendar_month::date
      ) months) as monthly`);
    const row = result.rows[0];
    const paidTeacherSalaries = row.paidTeacherSalaries ?? '0.00';
    const otherExpenses = row.otherExpenses ?? '0.00';
    return {
      period: { startDate, endDate },
      collectedFees: row.collectedFees ?? '0.00',
      paidTeacherSalaries,
      otherExpenses,
      totalExpenditure: (Number(paidTeacherSalaries) + Number(otherExpenses)).toFixed(2),
      netIncome: (
        Number(row.collectedFees ?? 0) -
        Number(paidTeacherSalaries) -
        Number(otherExpenses)
      ).toFixed(2),
      categoryBreakdown: row.categoryBreakdown ?? [],
      monthly: row.monthly ?? [],
    };
  });
}
