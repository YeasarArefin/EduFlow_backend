import { and, desc, eq } from "drizzle-orm";
import { db } from "../database/client";
import { subscriptions } from "../database/schema/subscriptions";
import { workspaces } from "../database/schema/workspaces";
import { AppError } from "../middleware/error-handler";
import { recordAuditLog } from "./audit-log.service";

export type SubscriptionLifecycleTransition = "renewal_due" | "expired" | "locked" | "unlocked" | "scheduled_deletion";

function invalidTransition(from: string, to: string): never {
  throw new AppError(
    "INVALID_SUBSCRIPTION_TRANSITION",
    `Cannot transition subscription lifecycle from ${from} to ${to}.`,
    409
  );
}

export async function transitionSubscriptionLifecycle(
  workspaceId: string,
  target: SubscriptionLifecycleTransition,
  now = new Date(),
  scheduledDeleteAt?: Date,
  actorUserId?: string
) {
  return db.transaction(async (transaction) => {
    const [subscription] = await transaction
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
      .for("update");
    const [workspace] = await transaction
      .select({
        status: workspaces.status,
        scheduledDeleteAt: workspaces.scheduledDeleteAt
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update");

    if (!workspace) throw new AppError("WORKSPACE_NOT_FOUND", "The workspace was not found.", 404);

    if (target === "renewal_due" || target === "expired") {
      if (!subscription) throw new AppError("SUBSCRIPTION_NOT_FOUND", "The workspace has no subscription.", 404);
      if (subscription.status === target) return { subscription, workspace };
      if (target === "renewal_due") {
        if (subscription.status !== "active" || !subscription.renewalDueAt || subscription.renewalDueAt > now)
          invalidTransition(subscription.status, target);
      } else if (subscription.status !== "renewal_due" || !subscription.expiresAt || subscription.expiresAt > now) {
        invalidTransition(subscription.status, target);
      }
      const [updatedSubscription] = await transaction
        .update(subscriptions)
        .set({ status: target, updatedAt: now })
        .where(and(eq(subscriptions.id, subscription.id), eq(subscriptions.status, subscription.status)))
        .returning();
      if (actorUserId) await recordAuditLog(transaction, { actorUserId, action: `lifecycle.${target}`, entityType: "subscription", entityId: updatedSubscription.id, workspaceId, metadata: { status: target } });
      return { subscription: updatedSubscription, workspace };
    }

    if (target === "locked") {
      if (workspace.status === "locked") return { subscription, workspace };
      if (workspace.status !== "active" || !subscription || subscription.status !== "expired")
        invalidTransition(subscription?.status ?? workspace.status, target);
      const [updatedWorkspace] = await transaction
        .update(workspaces)
        .set({ status: "locked", lockedAt: now, updatedAt: now })
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.status, "active")))
        .returning();
      if (actorUserId) await recordAuditLog(transaction, { actorUserId, action: "lifecycle.locked", entityType: "workspace", entityId: workspaceId, workspaceId, metadata: { status: "locked" } });
      return { subscription, workspace: updatedWorkspace };
    }

    if (target === "unlocked") {
      if (workspace.status === "active") return { subscription, workspace };
      if (
        workspace.status !== "locked" ||
        !subscription ||
        !["trial", "active", "renewal_due"].includes(subscription.status)
      )
        invalidTransition(workspace.status, target);
      const [updatedWorkspace] = await transaction
        .update(workspaces)
        .set({
          status: "active",
          lockedAt: null,
          scheduledDeleteAt: null,
          updatedAt: now
        })
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.status, "locked")))
        .returning();
      if (actorUserId) await recordAuditLog(transaction, { actorUserId, action: "lifecycle.unlocked", entityType: "workspace", entityId: workspaceId, workspaceId, metadata: { status: "active" } });
      return { subscription, workspace: updatedWorkspace };
    }

    if (workspace.status === "scheduled_deletion") return { subscription, workspace };
    const deletionAt = scheduledDeleteAt ?? workspace.scheduledDeleteAt;
    if (workspace.status !== "locked" || !deletionAt || deletionAt <= now) invalidTransition(workspace.status, target);
    const [updatedWorkspace] = await transaction
      .update(workspaces)
      .set({
        status: "scheduled_deletion",
        scheduledDeleteAt: deletionAt,
        updatedAt: now
      })
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.status, "locked")))
      .returning();
    if (actorUserId) await recordAuditLog(transaction, { actorUserId, action: "lifecycle.scheduled_deletion", entityType: "workspace", entityId: workspaceId, workspaceId, metadata: { status: "scheduled_deletion", scheduledDeleteAt: deletionAt.toISOString() } });
    return { subscription, workspace: updatedWorkspace };
  });
}
