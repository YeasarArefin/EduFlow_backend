import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { expensePaymentMethods, expenseStatuses } from '../../config/expenses';
import { workspaces } from './workspaces';

export const expensePaymentMethod = pgEnum('expense_payment_method', expensePaymentMethods);
export const expenseStatus = pgEnum('expense_status', expenseStatuses);

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('expense_categories_workspace_name_idx').on(table.workspaceId, table.name),
    unique('expense_categories_id_workspace_unique').on(table.id, table.workspaceId),
    index('expense_categories_workspace_active_idx').on(table.workspaceId, table.isActive),
    pgPolicy('expense_categories_workspace_isolation', {
      for: 'all',
      to: 'eduflow_app',
      using: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
      withCheck: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
    }),
  ]
).enableRLS();

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    categoryId: uuid('category_id').notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    amount: numeric('amount', { precision: 19, scale: 2 }).notNull(),
    expenseDate: date('expense_date')
      .notNull()
      .default(sql`current_date`),
    paymentMethod: expensePaymentMethod('payment_method').notNull(),
    description: text('description'),
    recordedByUserId: text('recorded_by_user_id').notNull(),
    status: expenseStatus('status').notNull().default('active'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedByUserId: text('reversed_by_user_id'),
    reversalReason: varchar('reversal_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('expenses_workspace_date_idx').on(table.workspaceId, table.expenseDate),
    index('expenses_workspace_category_date_idx').on(
      table.workspaceId,
      table.categoryId,
      table.expenseDate
    ),
    index('expenses_workspace_status_date_idx').on(
      table.workspaceId,
      table.status,
      table.expenseDate
    ),
    foreignKey({
      name: 'expenses_category_workspace_fk',
      columns: [table.categoryId, table.workspaceId],
      foreignColumns: [expenseCategories.id, expenseCategories.workspaceId],
    }),
    check(
      'expenses_amount_chk',
      sql`${table.amount} > 0 and ${table.amount} < 'Infinity'::numeric`
    ),
    check(
      'expenses_reversal_chk',
      sql`(${table.status} = 'active' and ${table.reversedAt} is null and ${table.reversedByUserId} is null and ${table.reversalReason} is null) or (${table.status} = 'reversed' and ${table.reversedAt} is not null and ${table.reversedByUserId} is not null and ${table.reversalReason} is not null)`
    ),
    pgPolicy('expenses_workspace_isolation', {
      for: 'all',
      to: 'eduflow_app',
      using: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
      withCheck: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
    }),
  ]
).enableRLS();
