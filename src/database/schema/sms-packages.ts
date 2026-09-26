import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const smsRechargeStatus = pgEnum('sms_recharge_status', ['pending', 'approved', 'rejected']);
export const smsPackages = pgTable('sms_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  credits: bigint('credits', { mode: 'bigint' }).notNull(),
  priceMinor: bigint('price_minor', { mode: 'bigint' }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sms_packages_active_idx').on(t.isActive), check('sms_packages_values_chk', sql`${t.credits} > 0 and ${t.priceMinor} >= 0`)]);
export const smsRechargeRequests = pgTable('sms_recharge_requests', {
  id: uuid('id').defaultRandom().primaryKey(), workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  packageId: uuid('package_id').notNull().references(() => smsPackages.id), requestedByUserId: text('requested_by_user_id').notNull(),
  credits: bigint('credits', { mode: 'bigint' }).notNull(), amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull().default('bkash'), transactionId: varchar('transaction_id', { length: 100 }).notNull().unique(),
  status: smsRechargeStatus('status').notNull().default('pending'), reviewedAt: timestamp('reviewed_at', { withTimezone: true }), reviewedByUserId: text('reviewed_by_user_id'), rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sms_recharge_requests_workspace_created_idx').on(t.workspaceId, t.createdAt), index('sms_recharge_requests_status_created_idx').on(t.status, t.createdAt), check('sms_recharge_requests_values_chk', sql`${t.credits} > 0 and ${t.amountMinor} >= 0`)]);
