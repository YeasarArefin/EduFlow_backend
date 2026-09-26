import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import {
  smsCreditLedger,
  smsWallets,
  type smsCreditTransactionType,
} from '../database/schema/sms-wallet';
import { AppError } from '../middleware/error-handler';
import type { SmsWalletCreditInput, SmsWalletHistoryQuery } from '../types/sms-wallet';
import { recordAuditLog } from './audit-log.service';

type SmsCreditTransactionType = (typeof smsCreditTransactionType.enumValues)[number];
type WalletBalance = typeof smsWallets.$inferSelect;

function assertPositiveCredits(amount: bigint): void {
  if (amount <= 0n) {
    throw new AppError(
      'INVALID_SMS_CREDIT_AMOUNT',
      'SMS credit amount must be greater than zero.',
      400
    );
  }
}

function mapWallet(wallet: WalletBalance) {
  return {
    id: wallet.id,
    workspaceId: wallet.workspaceId,
    availableCredits: wallet.availableCredits.toString(),
    reservedCredits: wallet.reservedCredits.toString(),
    purchasedCredits: wallet.purchasedCredits.toString(),
    usedCredits: wallet.usedCredits.toString(),
    refundedCredits: wallet.refundedCredits.toString(),
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

async function ensureWallet(
  transaction: Parameters<Parameters<typeof withWorkspaceContext>[1]>[0],
  workspaceId: string
) {
  await transaction.insert(smsWallets).values({ workspaceId }).onConflictDoNothing();
}

async function readWallet(
  transaction: Parameters<Parameters<typeof withWorkspaceContext>[1]>[0],
  workspaceId: string
) {
  const [wallet] = await transaction
    .select()
    .from(smsWallets)
    .where(eq(smsWallets.workspaceId, workspaceId))
    .limit(1);
  if (!wallet) throw new AppError('SMS_WALLET_NOT_FOUND', 'SMS wallet was not found.', 404);
  return wallet;
}

function ledgerValues(
  wallet: WalletBalance,
  transactionType: SmsCreditTransactionType,
  input: SmsWalletCreditInput,
  availableCreditsDelta: bigint,
  reservedCreditsDelta: bigint
) {
  return {
    workspaceId: wallet.workspaceId,
    walletId: wallet.id,
    transactionType,
    availableCreditsDelta,
    reservedCreditsDelta,
    availableCreditsAfter: wallet.availableCredits,
    reservedCreditsAfter: wallet.reservedCredits,
    actorUserId: input.actorUserId ?? null,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
  };
}

async function recordWalletChange(
  transaction: Parameters<Parameters<typeof withWorkspaceContext>[1]>[0],
  wallet: WalletBalance,
  transactionType: SmsCreditTransactionType,
  input: SmsWalletCreditInput,
  availableCreditsDelta: bigint,
  reservedCreditsDelta: bigint
) {
  const [ledgerEntry] = await transaction
    .insert(smsCreditLedger)
    .values(
      ledgerValues(wallet, transactionType, input, availableCreditsDelta, reservedCreditsDelta)
    )
    .returning();

  await recordAuditLog(transaction, {
    workspaceId: wallet.workspaceId,
    actorUserId: input.actorUserId ?? null,
    action: `sms_wallet.${transactionType}`,
    entityType: 'sms_credit_ledger',
    entityId: ledgerEntry.id,
    metadata: {
      availableCreditsDelta: availableCreditsDelta.toString(),
      reservedCreditsDelta: reservedCreditsDelta.toString(),
      referenceType: input.referenceType ?? null,
    },
  });

  return mapWallet(wallet);
}

/** Credits a wallet for a verified purchase. SMS2 will call this with the approved payment request as its reference. */
export async function creditPurchasedSmsCredits(workspaceId: string, input: SmsWalletCreditInput) {
  assertPositiveCredits(input.amount);
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await ensureWallet(transaction, workspaceId);
    await transaction.execute(sql`select set_config('app.sms_wallet_ledger_write', 'on', true)`);
    const [wallet] = await transaction
      .update(smsWallets)
      .set({
        availableCredits: sql`${smsWallets.availableCredits} + ${input.amount}`,
        purchasedCredits: sql`${smsWallets.purchasedCredits} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(smsWallets.workspaceId, workspaceId))
      .returning();
    if (!wallet) throw new AppError('SMS_WALLET_NOT_FOUND', 'SMS wallet was not found.', 404);
    return recordWalletChange(transaction, wallet, 'purchase', input, input.amount, 0n);
  });
}

/** Atomically moves available credits into a reservation before a future provider send. */
export async function reserveSmsCredits(workspaceId: string, input: SmsWalletCreditInput) {
  assertPositiveCredits(input.amount);
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await ensureWallet(transaction, workspaceId);
    await transaction.execute(sql`select set_config('app.sms_wallet_ledger_write', 'on', true)`);
    const [wallet] = await transaction
      .update(smsWallets)
      .set({
        availableCredits: sql`${smsWallets.availableCredits} - ${input.amount}`,
        reservedCredits: sql`${smsWallets.reservedCredits} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(smsWallets.workspaceId, workspaceId), gte(smsWallets.availableCredits, input.amount))
      )
      .returning();
    if (!wallet)
      throw new AppError(
        'INSUFFICIENT_SMS_BALANCE',
        'There are not enough available SMS credits for this operation.',
        409
      );
    return recordWalletChange(
      transaction,
      wallet,
      'reservation',
      input,
      -input.amount,
      input.amount
    );
  });
}

/** Atomically converts a prior reservation into consumed credits after a provider accepts a send. */
export async function consumeReservedSmsCredits(workspaceId: string, input: SmsWalletCreditInput) {
  assertPositiveCredits(input.amount);
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await ensureWallet(transaction, workspaceId);
    await transaction.execute(sql`select set_config('app.sms_wallet_ledger_write', 'on', true)`);
    const [wallet] = await transaction
      .update(smsWallets)
      .set({
        reservedCredits: sql`${smsWallets.reservedCredits} - ${input.amount}`,
        usedCredits: sql`${smsWallets.usedCredits} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(smsWallets.workspaceId, workspaceId), gte(smsWallets.reservedCredits, input.amount))
      )
      .returning();
    if (!wallet)
      throw new AppError(
        'INSUFFICIENT_RESERVED_SMS_BALANCE',
        'There are not enough reserved SMS credits for this operation.',
        409
      );
    return recordWalletChange(transaction, wallet, 'usage', input, 0n, -input.amount);
  });
}

/** Releases reserved credits after a send cannot proceed. */
export async function refundReservedSmsCredits(workspaceId: string, input: SmsWalletCreditInput) {
  assertPositiveCredits(input.amount);
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await ensureWallet(transaction, workspaceId);
    await transaction.execute(sql`select set_config('app.sms_wallet_ledger_write', 'on', true)`);
    const [wallet] = await transaction
      .update(smsWallets)
      .set({
        availableCredits: sql`${smsWallets.availableCredits} + ${input.amount}`,
        reservedCredits: sql`${smsWallets.reservedCredits} - ${input.amount}`,
        refundedCredits: sql`${smsWallets.refundedCredits} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(smsWallets.workspaceId, workspaceId), gte(smsWallets.reservedCredits, input.amount))
      )
      .returning();
    if (!wallet)
      throw new AppError(
        'INSUFFICIENT_RESERVED_SMS_BALANCE',
        'There are not enough reserved SMS credits for this operation.',
        409
      );
    return recordWalletChange(transaction, wallet, 'refund', input, input.amount, -input.amount);
  });
}

export async function getSmsWalletSummary(workspaceId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await ensureWallet(transaction, workspaceId);
    return mapWallet(await readWallet(transaction, workspaceId));
  });
}

export async function listSmsWalletHistory(workspaceId: string, query: SmsWalletHistoryQuery) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const [rows, totalResult] = await Promise.all([
      transaction
        .select()
        .from(smsCreditLedger)
        .where(eq(smsCreditLedger.workspaceId, workspaceId))
        .orderBy(desc(smsCreditLedger.createdAt), desc(smsCreditLedger.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      transaction
        .select({ total: count() })
        .from(smsCreditLedger)
        .where(eq(smsCreditLedger.workspaceId, workspaceId)),
    ]);
    const total = Number(totalResult[0]?.total ?? 0);
    return {
      data: rows.map((entry) => ({
        id: entry.id,
        transactionType: entry.transactionType,
        availableCreditsDelta: entry.availableCreditsDelta.toString(),
        reservedCreditsDelta: entry.reservedCreditsDelta.toString(),
        availableCreditsAfter: entry.availableCreditsAfter.toString(),
        reservedCreditsAfter: entry.reservedCreditsAfter.toString(),
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  });
}
