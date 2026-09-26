import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const smsTemplates = pgTable(
  'sms_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: varchar('name', { length: 120 }).notNull(),
    category: varchar('category', { length: 60 }).notNull().default('general'),
    body: text('body').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sms_templates_workspace_active_idx').on(table.workspaceId, table.isActive)]
);
