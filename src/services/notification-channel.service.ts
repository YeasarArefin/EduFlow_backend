import { eq } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { notificationDeliveries } from '../database/schema/notification-deliveries';
import { workspaceSettings } from '../database/schema/workspaces';
export async function recordNotificationChannels(
  workspaceId: string,
  eventType: string,
  eventId: string,
  emailEnabled: boolean,
  smsEnabled: boolean
) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const statuses = [];
    for (const [channel, enabled] of [
      ['email', emailEnabled],
      ['sms', smsEnabled],
    ] as const) {
      const [row] = await tx
        .insert(notificationDeliveries)
        .values({
          workspaceId,
          eventType,
          eventId,
          channel,
          status: enabled ? 'skipped' : 'skipped',
          error: enabled
            ? 'Delivery is deferred until the configured provider worker runs.'
            : 'Channel disabled by workspace settings.',
        })
        .onConflictDoNothing()
        .returning();
      if (row) statuses.push(row);
    }
    return statuses;
  });
}
export async function notifyAbsenceFinalization(workspaceId: string, sessionId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [s] = await tx
      .select({
        email: workspaceSettings.absenceEmailEnabled,
        sms: workspaceSettings.absenceSmsEnabled,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    return recordNotificationChannels(
      workspaceId,
      'student_absence',
      sessionId,
      Boolean(s?.email),
      Boolean(s?.sms)
    );
  });
}
export async function notifyPaymentRecorded(workspaceId: string, paymentId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [s] = await tx
      .select({
        email: workspaceSettings.paymentConfirmationEnabled,
        sms: workspaceSettings.paymentSmsEnabled,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    return recordNotificationChannels(
      workspaceId,
      'fee_payment',
      paymentId,
      Boolean(s?.email),
      Boolean(s?.sms)
    );
  });
}
