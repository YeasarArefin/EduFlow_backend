import { desc, eq } from "drizzle-orm";
import { db } from "../database/client";
import { subscriptions } from "../database/schema/subscriptions";
import { workspaces } from "../database/schema/workspaces";

export type SubscriptionAccessStatus =
  | "verification_pending"
  | "payment_pending"
  | "trial"
  | "active"
  | "renewal_due"
  | "subscription_expired"
  | "locked"
  | "scheduled_for_deletion"
  | "suspended";

type SubscriptionStatus = "trial" | "pending" | "active" | "renewal_due" | "expired" | "cancelled" | "suspended";

export type SubscriptionAccessState = {
  allowed: boolean;
  status: SubscriptionAccessStatus;
  reason: string;
};

export type SubscriptionAccessInput = {
  workspaceStatus: "pending" | "active" | "locked" | "suspended" | "scheduled_deletion" | "deleted";
  subscription: {
    status: SubscriptionStatus;
    startsAt: Date | null;
    expiresAt: Date | null;
    trialEndsAt: Date | null;
  } | null;
  now?: Date;
};

export function deriveSubscriptionAccessState({
  workspaceStatus,
  subscription,
  now = new Date()
}: SubscriptionAccessInput): SubscriptionAccessState {
  if (workspaceStatus === "locked" || workspaceStatus === "deleted") {
    return {
      allowed: false,
      status: "locked",
      reason: "Workspace access is locked."
    };
  }
  if (workspaceStatus === "scheduled_deletion") {
    return {
      allowed: false,
      status: "scheduled_for_deletion",
      reason: "Workspace access is scheduled for deletion."
    };
  }
  if (workspaceStatus === "suspended") {
    return {
      allowed: false,
      status: "suspended",
      reason: "Workspace access is suspended."
    };
  }
  if (workspaceStatus === "pending") {
    return {
      allowed: false,
      status: "verification_pending",
      reason: "Workspace verification is pending."
    };
  }
  if (!subscription) {
    return {
      allowed: false,
      status: "payment_pending",
      reason: "No current subscription was found."
    };
  }
  if (subscription.startsAt && subscription.startsAt > now) {
    return {
      allowed: false,
      status: "payment_pending",
      reason: "Subscription has not started yet."
    };
  }
  if (subscription.status === "expired" || subscription.status === "cancelled" || subscription.status === "suspended") {
    return {
      allowed: false,
      status: "subscription_expired",
      reason: "Subscription is not active."
    };
  }
  if (subscription.status === "trial" && subscription.trialEndsAt && subscription.trialEndsAt <= now) {
    return {
      allowed: false,
      status: "subscription_expired",
      reason: "Trial subscription has expired."
    };
  }
  if (
    (subscription.status === "active" || subscription.status === "renewal_due") &&
    subscription.expiresAt &&
    subscription.expiresAt <= now
  ) {
    return {
      allowed: false,
      status: "subscription_expired",
      reason: "Subscription has expired."
    };
  }
  if (subscription.status === "pending") {
    return {
      allowed: false,
      status: "payment_pending",
      reason: "Subscription payment is pending."
    };
  }
  return {
    allowed: true,
    status: subscription.status,
    reason: "Subscription access is allowed."
  };
}

export async function resolveWorkspaceSubscriptionAccess(
  workspaceId: string,
  now = new Date()
): Promise<SubscriptionAccessState> {
  const [workspace] = await db
    .select({ status: workspaces.status })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) {
    return {
      allowed: false,
      status: "verification_pending",
      reason: "Workspace was not found."
    };
  }

  const [subscription] = await db
    .select({
      status: subscriptions.status,
      startsAt: subscriptions.startsAt,
      expiresAt: subscriptions.expiresAt,
      trialEndsAt: subscriptions.trialEndsAt
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return deriveSubscriptionAccessState({
    workspaceStatus: workspace.status,
    subscription: subscription ? { ...subscription, status: subscription.status } : null,
    now
  });
}
