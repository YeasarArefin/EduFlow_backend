import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { batches } from './batches';
import { workspaces } from './workspaces';

export const noticeAudience = pgEnum('notice_audience', ['batch', 'all_students', 'all_teachers', 'everyone']);
export const noticeRecipientStatus = pgEnum('notice_recipient_status', ['queued', 'processing', 'sent', 'failed', 'skipped']);
export const noticeRecipientKind = pgEnum('notice_recipient_kind', ['student', 'teacher']);

export const notices = pgTable('notices', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  audience: noticeAudience('audience').notNull(),
  batchId: uuid('batch_id').references(() => batches.id),
  subject: varchar('subject', { length: 200 }).notNull(),
  body: text('body').notNull(),
  createdByUserId: text('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('notices_workspace_created_idx').on(table.workspaceId, table.createdAt)]);

export const noticeRecipients = pgTable('notice_recipients', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  noticeId: uuid('notice_id').notNull().references(() => notices.id, { onDelete: 'cascade' }),
  recipientKind: noticeRecipientKind('recipient_kind').notNull(),
  recipientId: uuid('recipient_id').notNull(),
  recipientName: varchar('recipient_name', { length: 150 }),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  status: noticeRecipientStatus('status').notNull().default('queued'),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('notice_recipients_notice_kind_recipient_idx').on(table.noticeId, table.recipientKind, table.recipientId),
  index('notice_recipients_workspace_notice_status_idx').on(table.workspaceId, table.noticeId, table.status),
  index('notice_recipients_notice_status_idx').on(table.noticeId, table.status),
]);
