import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { smsCreditLedger, smsWallets } from '../database/schema/sms-wallet';
import { smsMessages, smsRecipients } from '../database/schema/sms-messages';
import { students } from '../database/schema/students';
import { AppError } from '../middleware/error-handler';
import type { QueueSmsInput, ResolvedSmsRecipient } from '../types/sms-queue';
import { calculateSmsSegments } from './sms-segment.service';
import { recordAuditLog } from './audit-log.service';

function normalizePhone(phone: string) {
  return phone.replace(/[\s()-]/g, '');
}

export async function queueSmsMessage(workspaceId: string, input: QueueSmsInput) {
  const studentIds = input.studentIds ?? [];
  const selectedStudents = studentIds.length
    ? await withWorkspaceContext(workspaceId, (transaction) =>
        transaction
          .select({ id: students.id, phone: students.phone, guardianPhone: students.guardianPhone })
          .from(students)
          .where(and(eq(students.workspaceId, workspaceId), inArray(students.id, studentIds)))
      )
    : [];
  const recipients = new Map<string, ResolvedSmsRecipient>();
  for (const student of selectedStudents) {
    if ((input.target === 'student' || input.target === 'both') && student.phone)
      recipients.set(normalizePhone(student.phone), {
        studentId: student.id,
        phone: normalizePhone(student.phone),
        recipientType: 'student',
      });
    if ((input.target === 'guardian' || input.target === 'both') && student.guardianPhone)
      recipients.set(normalizePhone(student.guardianPhone), {
        studentId: student.id,
        phone: normalizePhone(student.guardianPhone),
        recipientType: 'guardian',
      });
  }
  for (const phone of input.customNumbers ?? [])
    recipients.set(normalizePhone(phone), {
      studentId: null,
      phone: normalizePhone(phone),
      recipientType: 'custom',
    });
  const recipientRows = [...recipients.values()];
  if (!recipientRows.length)
    throw new AppError('SMS_RECIPIENTS_NOT_FOUND', 'No valid SMS recipients were found.', 400);
  const preview = calculateSmsSegments(input.body, recipientRows.length);
  const credits = BigInt(preview.totalCredits);
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await transaction.execute(sql`select set_config('app.sms_wallet_ledger_write', 'on', true)`);
    await transaction.insert(smsWallets).values({ workspaceId }).onConflictDoNothing();
    const [wallet] = await transaction
      .update(smsWallets)
      .set({
        availableCredits: sql`${smsWallets.availableCredits} - ${credits}`,
        reservedCredits: sql`${smsWallets.reservedCredits} + ${credits}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(smsWallets.workspaceId, workspaceId), gte(smsWallets.availableCredits, credits))
      )
      .returning();
    if (!wallet)
      throw new AppError(
        'INSUFFICIENT_SMS_BALANCE',
        'There are not enough available SMS credits for this message.',
        409
      );
    const [message] = await transaction
      .insert(smsMessages)
      .values({
        workspaceId,
        source: input.source ?? 'manual',
        body: input.body,
        recipientCount: recipientRows.length,
        creditsRequired: credits,
        creditsReserved: credits,
      })
      .returning();
    await transaction.insert(smsRecipients).values(
      recipientRows.map((recipient) => ({
        workspaceId,
        messageId: message.id,
        studentId: recipient.studentId,
        recipientType: recipient.recipientType,
        phone: recipient.phone,
        segments: preview.segmentsPerRecipient,
        credits: BigInt(preview.segmentsPerRecipient),
      }))
    );
    await transaction.insert(smsCreditLedger).values({
      workspaceId,
      walletId: wallet.id,
      transactionType: 'reservation',
      availableCreditsDelta: -credits,
      reservedCreditsDelta: credits,
      availableCreditsAfter: wallet.availableCredits,
      reservedCreditsAfter: wallet.reservedCredits,
      referenceType: 'sms_message',
      referenceId: message.id,
      actorUserId: input.actorUserId,
      reason: 'SMS message queued.',
    });
    await recordAuditLog(transaction, {
      workspaceId,
      actorUserId: input.actorUserId,
      action: 'sms_message.queued',
      entityType: 'sms_message',
      entityId: message.id,
      metadata: { recipientCount: recipientRows.length, credits: credits.toString() },
    });
    return {
      id: message.id,
      status: message.status,
      recipientCount: message.recipientCount,
      creditsReserved: message.creditsReserved.toString(),
    };
  });
}

/** Claims a small batch without keeping DB locks while a future vendor adapter sends it. */
export async function claimSmsRecipientBatch(
  workspaceId: string,
  messageId: string,
  batchSize = 25
) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const rows = (
      await transaction.execute(
        sql`with claimed as (select id from sms_recipients where workspace_id = ${workspaceId} and message_id = ${messageId} and status = 'queued' order by created_at limit ${batchSize} for update skip locked) update sms_recipients recipient set status = 'processing' from claimed where recipient.id = claimed.id returning recipient.id, recipient.phone, recipient.credits`
      )
    ).rows;
    if (rows.length)
      await transaction
        .update(smsMessages)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(and(eq(smsMessages.id, messageId), eq(smsMessages.workspaceId, workspaceId)));
    return rows;
  });
}
export async function listSmsMessages(workspaceId: string) {
  return withWorkspaceContext(workspaceId, async (tx) =>
    (
      await tx
        .select()
        .from(smsMessages)
        .where(eq(smsMessages.workspaceId, workspaceId))
        .orderBy(desc(smsMessages.createdAt))
    ).map((m) => ({ ...m, creditsUsed: m.creditsUsed.toString() }))
  );
}
export async function getSmsMessageDelivery(workspaceId: string, id: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [message] = await tx
      .select()
      .from(smsMessages)
      .where(and(eq(smsMessages.workspaceId, workspaceId), eq(smsMessages.id, id)));
    if (!message) throw new AppError('SMS_MESSAGE_NOT_FOUND', 'SMS message was not found.', 404);
    const rows = await tx
      .select({
        id: smsRecipients.id,
        name: students.fullName,
        phone: smsRecipients.phone,
        recipientType: smsRecipients.recipientType,
        segments: smsRecipients.segments,
        status: smsRecipients.status,
        providerMessageId: smsRecipients.providerMessageId,
        providerError: smsRecipients.providerError,
      })
      .from(smsRecipients)
      .leftJoin(students, eq(students.id, smsRecipients.studentId))
      .where(and(eq(smsRecipients.workspaceId, workspaceId), eq(smsRecipients.messageId, id)));
    return { message, recipients: rows };
  });
}
export async function retryFailedSmsRecipients(workspaceId: string, id: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const rows = await tx
      .update(smsRecipients)
      .set({ status: 'queued', providerError: null, providerMessageId: null, processedAt: null })
      .where(
        and(
          eq(smsRecipients.workspaceId, workspaceId),
          eq(smsRecipients.messageId, id),
          eq(smsRecipients.status, 'failed')
        )
      )
      .returning({ id: smsRecipients.id });
    if (rows.length)
      await tx
        .update(smsMessages)
        .set({ status: 'queued', updatedAt: new Date() })
        .where(and(eq(smsMessages.workspaceId, workspaceId), eq(smsMessages.id, id)));
    return { retried: rows.length };
  });
}
