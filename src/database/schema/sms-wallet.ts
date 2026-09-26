import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const smsCreditTransactionType = pgEnum('sms_credit_transaction_type', [
  'purchase',
  'usage',
  'reservation',
  'refund',
  'bonus',
  'admin_adjustment',
]);

/** A single mutable balance row for each workspace; every non-zero change is represented in sms_credit_ledger. */
export const smsWallets = pgTable(
  'sms_wallets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    availableCredits: bigint('available_credits', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    reservedCredits: bigint('reserved_credits', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    purchasedCredits: bigint('purchased_credits', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    usedCredits: bigint('used_credits', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    refundedCredits: bigint('refunded_credits', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sms_wallets_workspace_idx').on(table.workspaceId),
    uniqueIndex('sms_wallets_id_workspace_idx').on(table.id, table.workspaceId),
    check(
      'sms_wallets_balances_nonnegative_chk',
      sql`${table.availableCredits} >= 0 and ${table.reservedCredits} >= 0 and ${table.purchasedCredits} >= 0 and ${table.usedCredits} >= 0 and ${table.refundedCredits} >= 0`
    ),
  ]
);

/** Immutable balance movements. Signed deltas and after-balances make reconciliation deterministic. */
export const smsCreditLedger = pgTable(
  'sms_credit_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    walletId: uuid('wallet_id').notNull(),
    transactionType: smsCreditTransactionType('transaction_type').notNull(),
    availableCreditsDelta: bigint('available_credits_delta', { mode: 'bigint' }).notNull(),
    reservedCreditsDelta: bigint('reserved_credits_delta', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    availableCreditsAfter: bigint('available_credits_after', { mode: 'bigint' }).notNull(),
    reservedCreditsAfter: bigint('reserved_credits_after', { mode: 'bigint' }).notNull(),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    idempotencyKey: text('idempotency_key'),
    actorUserId: text('actor_user_id'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sms_credit_ledger_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('sms_credit_ledger_wallet_created_idx').on(table.walletId, table.createdAt),
    foreignKey({
      columns: [table.walletId, table.workspaceId],
      foreignColumns: [smsWallets.id, smsWallets.workspaceId],
      name: 'sms_credit_ledger_wallet_workspace_fk',
    }),
    uniqueIndex('sms_credit_ledger_workspace_idempotency_idx')
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check(
      'sms_credit_ledger_after_balances_nonnegative_chk',
      sql`${table.availableCreditsAfter} >= 0 and ${table.reservedCreditsAfter} >= 0`
    ),
    check(
      'sms_credit_ledger_nonzero_change_chk',
      sql`${table.availableCreditsDelta} <> 0 or ${table.reservedCreditsDelta} <> 0`
    ),
  ]
);
