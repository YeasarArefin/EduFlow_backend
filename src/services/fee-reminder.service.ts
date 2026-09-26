import { and, eq, sql } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { studentFees } from '../database/schema/fees';
import { workspaceSettings } from '../database/schema/workspaces';
import { notificationDeliveries } from '../database/schema/notification-deliveries';
export async function processFeeReminders(
  workspaceId: string,
  today = new Date().toISOString().slice(0, 10)
) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [s] = await tx
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    if (!s) return { processed: 0 };
    const fees = await tx
      .select({
        id: studentFees.id,
        dueDate: studentFees.dueDate,
        graceDate: studentFees.graceDate,
      })
      .from(studentFees)
      .where(and(eq(studentFees.workspaceId, workspaceId), sql`${studentFees.dueAmount} > 0`));
    let processed = 0;
    for (const fee of fees) {
      const due = new Date(fee.dueDate).getTime(),
        grace = new Date(fee.graceDate).getTime(),
        now = new Date(today).getTime();
      const event =
        now === due - s.paymentReminderDaysBefore * 86400000
          ? 'payment_reminder'
          : now === grace + s.graceReminderDaysAfter * 86400000
            ? 'grace_reminder'
            : now >= due + s.overdueWarningDaysAfter * 86400000
              ? 'overdue_warning'
              : null;
      if (!event) continue;
      const email =
        event === 'payment_reminder'
          ? s.paymentReminderEnabled
          : event === 'grace_reminder'
            ? s.graceReminderEnabled
            : s.overdueWarningEnabled;
      const sms =
        event === 'payment_reminder'
          ? s.reminderSmsEnabled
          : event === 'grace_reminder'
            ? s.reminderSmsEnabled
            : s.overdueSmsEnabled;
      for (const [channel, enabled] of [
        ['email', email],
        ['sms', sms],
      ] as const) {
        const row = await tx
          .insert(notificationDeliveries)
          .values({
            workspaceId,
            eventType: event,
            eventId: `${fee.id}:${today}`,
            channel,
            status: 'skipped',
            error: enabled ? 'Provider dispatch deferred.' : 'Channel disabled.',
          })
          .onConflictDoNothing()
          .returning();
        processed += row.length;
      }
    }
    return { processed };
  });
}
