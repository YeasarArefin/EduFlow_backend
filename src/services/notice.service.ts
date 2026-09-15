import { render } from '@react-email/render';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { createElement } from 'react';
import { z } from 'zod';
import { withWorkspaceContext } from '../database/client';
import { batchEnrollments, batches } from '../database/schema/batches';
import { noticeRecipients, notices } from '../database/schema/notices';
import { students } from '../database/schema/students';
import { teachers } from '../database/schema/teachers';
import { workspaces } from '../database/schema/workspaces';
import { NoticeEmail } from '../emails/notice-email';
import { AppError } from '../middleware/error-handler';
import type {
  createNoticeSchema,
  noticeListQuerySchema,
  noticeRecipientsQuerySchema,
  processNoticeBatchSchema,
} from '../validation/notice.validation';
import { BrevoEmailError, sendBrevoEmail } from './brevo-email.service';

type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
type ProcessNoticeBatchInput = z.infer<typeof processNoticeBatchSchema>;
type NoticeListQuery = z.infer<typeof noticeListQuerySchema>;
type NoticeRecipientsQuery = z.infer<typeof noticeRecipientsQuerySchema>;
type RecipientCandidate = {
  recipientKind: 'student' | 'teacher';
  recipientId: string;
  recipientName: string | null;
  recipientEmail: string | null;
};
type WorkspaceTransaction = Parameters<Parameters<typeof withWorkspaceContext>[1]>[0];
type ClaimedRecipient = {
  id: string;
  recipient_email: string | null;
  recipient_name: string | null;
};

export const MAX_NOTICE_RECIPIENT_RETRIES = 3;
const emailSchema = z.string().email();
const missingEmailError = 'No valid email address is available for this recipient.';

async function findNotice(
  transaction: WorkspaceTransaction,
  workspaceId: string,
  noticeId: string
) {
  const [notice] = await transaction
    .select()
    .from(notices)
    .where(and(eq(notices.id, noticeId), eq(notices.workspaceId, workspaceId)))
    .limit(1);
  if (!notice) throw new AppError('NOTICE_NOT_FOUND', 'The notice was not found.', 404);
  return notice;
}

async function findBatch(transaction: WorkspaceTransaction, workspaceId: string, batchId: string) {
  const [batch] = await transaction
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.workspaceId, workspaceId)))
    .limit(1);
  if (!batch) throw new AppError('BATCH_NOT_FOUND', 'The batch was not found.', 404);
}

async function resolveRecipients(
  transaction: WorkspaceTransaction,
  workspaceId: string,
  notice: typeof notices.$inferSelect
): Promise<RecipientCandidate[]> {
  const studentWhere = [eq(students.workspaceId, workspaceId), eq(students.status, 'active')];
  if (notice.audience === 'batch') {
    await findBatch(transaction, workspaceId, notice.batchId!);
    const rows = await transaction
      .select({
        recipientId: students.id,
        recipientName: students.fullName,
        recipientEmail: students.email,
      })
      .from(batchEnrollments)
      .innerJoin(
        students,
        and(eq(students.id, batchEnrollments.studentId), eq(students.workspaceId, workspaceId))
      )
      .where(
        and(
          eq(batchEnrollments.workspaceId, workspaceId),
          eq(batchEnrollments.batchId, notice.batchId!),
          eq(batchEnrollments.status, 'active'),
          ...studentWhere
        )
      );
    return rows.map((row) => ({
      recipientKind: 'student' as const,
      recipientId: row.recipientId,
      recipientName: row.recipientName,
      recipientEmail: row.recipientEmail,
    }));
  }
  const recipients: RecipientCandidate[] = [];
  if (notice.audience === 'all_students' || notice.audience === 'everyone') {
    const rows = await transaction
      .select({
        recipientId: students.id,
        recipientName: students.fullName,
        recipientEmail: students.email,
      })
      .from(students)
      .where(and(...studentWhere));
    recipients.push(
      ...rows.map((row) => ({
        recipientKind: 'student' as const,
        recipientId: row.recipientId,
        recipientName: row.recipientName,
        recipientEmail: row.recipientEmail,
      }))
    );
  }
  if (notice.audience === 'all_teachers' || notice.audience === 'everyone') {
    const rows = await transaction
      .select({
        recipientId: teachers.id,
        recipientName: teachers.name,
        recipientEmail: teachers.email,
      })
      .from(teachers)
      .where(and(eq(teachers.workspaceId, workspaceId), eq(teachers.status, 'active')));
    recipients.push(
      ...rows.map((row) => ({
        recipientKind: 'teacher' as const,
        recipientId: row.recipientId,
        recipientName: row.recipientName,
        recipientEmail: row.recipientEmail,
      }))
    );
  }
  return recipients;
}

async function getNoticeProgressForTransaction(
  transaction: WorkspaceTransaction,
  workspaceId: string,
  noticeId: string
) {
  const rows = await transaction
    .select({ status: noticeRecipients.status, total: count() })
    .from(noticeRecipients)
    .where(
      and(eq(noticeRecipients.workspaceId, workspaceId), eq(noticeRecipients.noticeId, noticeId))
    )
    .groupBy(noticeRecipients.status);
  const summary = { queued: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows) summary[row.status] = Number(row.total);
  return { total: Object.values(summary).reduce((sum, value) => sum + value, 0), ...summary };
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : 'Email delivery failed.').slice(0, 2_000);
}

export async function createNotice(workspaceId: string, userId: string, input: CreateNoticeInput) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    if (input.batchId) await findBatch(transaction, workspaceId, input.batchId);
    const [notice] = await transaction
      .insert(notices)
      .values({ workspaceId, createdByUserId: userId, ...input })
      .returning();
    return notice;
  });
}

export async function previewNoticeRecipients(workspaceId: string, noticeId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => ({
    count: (
      await resolveRecipients(
        transaction,
        workspaceId,
        await findNotice(transaction, workspaceId, noticeId)
      )
    ).length,
  }));
}

export async function queueNoticeRecipients(workspaceId: string, noticeId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const notice = await findNotice(transaction, workspaceId, noticeId);
    const recipients = await resolveRecipients(transaction, workspaceId, notice);
    if (recipients.length) {
      const recipientRows = recipients.map((recipient) => {
        const validEmail =
          recipient.recipientEmail && emailSchema.safeParse(recipient.recipientEmail).success;
        return {
          ...recipient,
          workspaceId,
          noticeId,
          status: validEmail ? ('queued' as const) : ('skipped' as const),
          lastError: validEmail ? null : missingEmailError,
        };
      });
      const validRecipientRows = recipientRows.filter((recipient) => recipient.status === 'queued');
      const invalidRecipientRows = recipientRows.filter(
        (recipient) => recipient.status === 'skipped'
      );
      if (invalidRecipientRows.length)
        await transaction
          .insert(noticeRecipients)
          .values(invalidRecipientRows)
          .onConflictDoNothing();
      if (validRecipientRows.length)
        await transaction
          .insert(noticeRecipients)
          .values(validRecipientRows)
          .onConflictDoUpdate({
            target: [
              noticeRecipients.noticeId,
              noticeRecipients.recipientKind,
              noticeRecipients.recipientId,
            ],
            set: {
              status: 'queued',
              lastError: null,
              claimedAt: null,
              recipientName: sql`excluded.recipient_name`,
              recipientEmail: sql`excluded.recipient_email`,
              updatedAt: new Date(),
            },
            where: and(
              eq(noticeRecipients.status, 'skipped'),
              eq(noticeRecipients.lastError, missingEmailError)
            ),
          });
    }
    return getNoticeProgressForTransaction(transaction, workspaceId, noticeId);
  });
}

async function claimQueuedRecipients(workspaceId: string, noticeId: string, limit: number) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await findNotice(transaction, workspaceId, noticeId);
    const claimed = await transaction.execute<ClaimedRecipient>(
      sql`with next_recipients as (select id from notice_recipients where workspace_id = ${workspaceId}::uuid and notice_id = ${noticeId}::uuid and status = 'queued' order by created_at, id for update skip locked limit ${limit}) update notice_recipients as recipient set status = 'processing', claimed_at = now(), updated_at = now() from next_recipients where recipient.id = next_recipients.id returning recipient.id, recipient.recipient_email, recipient.recipient_name`
    );
    const [workspace] = await transaction
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return {
      recipients: claimed.rows,
      workspaceName: workspace?.name?.trim() || 'Your coaching center',
    };
  });
}

async function markRecipientSent(
  workspaceId: string,
  noticeId: string,
  recipientId: string,
  providerMessageId: string | null
) {
  await withWorkspaceContext(workspaceId, async (transaction) => {
    await transaction
      .update(noticeRecipients)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noticeRecipients.id, recipientId),
          eq(noticeRecipients.workspaceId, workspaceId),
          eq(noticeRecipients.noticeId, noticeId),
          eq(noticeRecipients.status, 'processing')
        )
      );
  });
}

async function markRecipientFailure(
  workspaceId: string,
  noticeId: string,
  recipientId: string,
  error: unknown,
  transient: boolean
) {
  await withWorkspaceContext(workspaceId, async (transaction) => {
    await transaction
      .update(noticeRecipients)
      .set({
        status: transient ? 'failed' : 'skipped',
        retryCount: sql`${noticeRecipients.retryCount} + 1`,
        lastError: errorMessage(error),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noticeRecipients.id, recipientId),
          eq(noticeRecipients.workspaceId, workspaceId),
          eq(noticeRecipients.noticeId, noticeId),
          eq(noticeRecipients.status, 'processing')
        )
      );
  });
}

export async function processNextNoticeBatch(
  workspaceId: string,
  noticeId: string,
  input: ProcessNoticeBatchInput
) {
  const { recipients, workspaceName } = await claimQueuedRecipients(
    workspaceId,
    noticeId,
    input.limit
  );
  const notice = await withWorkspaceContext(workspaceId, (transaction) =>
    findNotice(transaction, workspaceId, noticeId)
  );
  const result = {
    claimedCount: recipients.length,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    recipientIds: recipients.map((recipient) => recipient.id),
  };
  for (const recipient of recipients) {
    if (!recipient.recipient_email || !emailSchema.safeParse(recipient.recipient_email).success) {
      await markRecipientFailure(
        workspaceId,
        noticeId,
        recipient.id,
        new Error(missingEmailError),
        false
      );
      result.skippedCount += 1;
      continue;
    }
    try {
      const props = {
        workspaceName,
        noticeTitle: notice.subject,
        noticeBody: notice.body,
        recipientName: recipient.recipient_name,
      };
      const htmlContent = await render(createElement(NoticeEmail, props));
      const textContent = await render(createElement(NoticeEmail, props), { plainText: true });
      const provider = await sendBrevoEmail({
        to: { email: recipient.recipient_email, name: recipient.recipient_name },
        subject: notice.subject,
        htmlContent,
        textContent,
      });
      await markRecipientSent(workspaceId, noticeId, recipient.id, provider.messageId);
      result.sentCount += 1;
    } catch (error) {
      const transient = error instanceof BrevoEmailError && error.transient;
      await markRecipientFailure(workspaceId, noticeId, recipient.id, error, transient);
      if (transient) result.failedCount += 1;
      else result.skippedCount += 1;
    }
  }
  return result;
}

export async function retryFailedNoticeRecipients(workspaceId: string, noticeId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await findNotice(transaction, workspaceId, noticeId);
    const updated = await transaction
      .update(noticeRecipients)
      .set({ status: 'queued', lastError: null, claimedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(noticeRecipients.workspaceId, workspaceId),
          eq(noticeRecipients.noticeId, noticeId),
          eq(noticeRecipients.status, 'failed'),
          sql`${noticeRecipients.retryCount} < ${MAX_NOTICE_RECIPIENT_RETRIES}`
        )
      )
      .returning({ id: noticeRecipients.id });
    return { retriedCount: updated.length };
  });
}

export async function getNoticeProgress(workspaceId: string, noticeId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await findNotice(transaction, workspaceId, noticeId);
    return getNoticeProgressForTransaction(transaction, workspaceId, noticeId);
  });
}

export async function listNotices(workspaceId: string, query: NoticeListQuery) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const offset = (query.page - 1) * query.limit;
    const [items, [{ total }]] = await Promise.all([
      transaction
        .select()
        .from(notices)
        .where(eq(notices.workspaceId, workspaceId))
        .orderBy(desc(notices.createdAt))
        .limit(query.limit)
        .offset(offset),
      transaction
        .select({ total: count() })
        .from(notices)
        .where(eq(notices.workspaceId, workspaceId)),
    ]);
    const totalCount = Number(total);
    return {
      data: items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / query.limit)),
      },
    };
  });
}

export async function getNoticeDetail(workspaceId: string, noticeId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const notice = await findNotice(transaction, workspaceId, noticeId);
    return {
      ...notice,
      progress: await getNoticeProgressForTransaction(transaction, workspaceId, noticeId),
    };
  });
}

export async function listNoticeRecipients(
  workspaceId: string,
  noticeId: string,
  query: NoticeRecipientsQuery
) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    await findNotice(transaction, workspaceId, noticeId);
    return transaction
      .select({
        id: noticeRecipients.id,
        recipientKind: noticeRecipients.recipientKind,
        recipientName: noticeRecipients.recipientName,
        recipientEmail: noticeRecipients.recipientEmail,
        status: noticeRecipients.status,
        retryCount: noticeRecipients.retryCount,
        lastError: noticeRecipients.lastError,
        sentAt: noticeRecipients.sentAt,
      })
      .from(noticeRecipients)
      .where(
        and(
          eq(noticeRecipients.workspaceId, workspaceId),
          eq(noticeRecipients.noticeId, noticeId),
          eq(noticeRecipients.status, query.status)
        )
      )
      .orderBy(desc(noticeRecipients.updatedAt));
  });
}
