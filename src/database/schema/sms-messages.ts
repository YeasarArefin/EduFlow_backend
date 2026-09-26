import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { students } from './students';
import { workspaces } from './workspaces';

export const smsMessageStatus = pgEnum('sms_message_status', [
  'queued',
  'processing',
  'completed',
  'partially_delivered',
  'failed',
]);
export const smsRecipientStatus = pgEnum('sms_recipient_status', [
  'queued',
  'processing',
  'sent',
  'delivered',
  'failed',
  'skipped',
]);

export const smsMessages = pgTable(
  'sms_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    source: varchar('source', { length: 50 }).notNull(),
    body: text('body').notNull(),
    status: smsMessageStatus('status').notNull().default('queued'),
    recipientCount: integer('recipient_count').notNull(),
    creditsRequired: bigint('credits_required', { mode: 'bigint' }).notNull(),
    creditsReserved: bigint('credits_reserved', { mode: 'bigint' }).notNull(),
    creditsUsed: bigint('credits_used', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    creditsRefunded: bigint('credits_refunded', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sms_messages_workspace_status_idx').on(table.workspaceId, table.status),
    check(
      'sms_messages_credit_amounts_nonnegative_chk',
      sql`${table.creditsRequired} >= 0 and ${table.creditsReserved} >= 0 and ${table.creditsUsed} >= 0 and ${table.creditsRefunded} >= 0`
    ),
    check('sms_messages_recipient_count_positive_chk', sql`${table.recipientCount} > 0`),
  ]
);

export const smsRecipients = pgTable(
  'sms_recipients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    messageId: uuid('message_id')
      .notNull()
      .references(() => smsMessages.id),
    studentId: uuid('student_id').references(() => students.id),
    recipientType: varchar('recipient_type', { length: 20 }).notNull(),
    phone: varchar('phone', { length: 30 }).notNull(),
    segments: integer('segments').notNull(),
    credits: bigint('credits', { mode: 'bigint' }).notNull(),
    status: smsRecipientStatus('status').notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    providerError: text('provider_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sms_recipients_message_status_idx').on(table.messageId, table.status),
    index('sms_recipients_workspace_status_idx').on(table.workspaceId, table.status),
    check('sms_recipients_segments_positive_chk', sql`${table.segments} > 0`),
    check('sms_recipients_credits_positive_chk', sql`${table.credits} > 0`),
  ]
);
