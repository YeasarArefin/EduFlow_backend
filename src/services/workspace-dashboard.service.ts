import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../database/client";
import { paymentRequests, plans, subscriptions } from "../database/schema/subscriptions";
import { workspaceMembers, workspaces } from "../database/schema/workspaces";
import { deriveSubscriptionAccessState } from "./subscription-access";
import { resolveWorkspaceEntitlements } from "./workspace-entitlements";

/** A compact, member-safe view of the active workspace for the coaching home. */
export async function getWorkspaceDashboardSummary(workspaceId: string) {
  const [workspaceResult, entitlementsResult, memberCountResult, latestPaymentResult] = await Promise.all([
    db
      .select({
        name: workspaces.name,
        status: workspaces.status,
        subscriptionId: subscriptions.id,
        subscriptionStatus: subscriptions.status,
        startsAt: subscriptions.startsAt,
        expiresAt: subscriptions.expiresAt,
        trialEndsAt: subscriptions.trialEndsAt,
        renewalDueAt: subscriptions.renewalDueAt,
        planName: plans.name
      })
      .from(workspaces)
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.workspaceId, workspaces.id),
          eq(
            subscriptions.createdAt,
            sql`(select max(s2.created_at) from subscriptions s2 where s2.workspace_id = ${workspaces.id})`
          )
        )
      )
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    resolveWorkspaceEntitlements(workspaceId),
    db.select({ total: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
    db
      .select({ status: paymentRequests.status, createdAt: paymentRequests.createdAt, reviewedAt: paymentRequests.reviewedAt })
      .from(paymentRequests)
      .where(and(eq(paymentRequests.workspaceId, workspaceId), eq(paymentRequests.purpose, "subscription")))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(1)
  ]);

  const workspace = workspaceResult[0];
  if (!workspace) return null;

  const access = deriveSubscriptionAccessState({
    workspaceStatus: workspace.status,
    subscription: workspace.subscriptionStatus
      ? {
          status: workspace.subscriptionStatus,
          startsAt: workspace.startsAt,
          expiresAt: workspace.expiresAt,
          trialEndsAt: workspace.trialEndsAt
        }
      : null
  });

  const entitlementEntries = Object.entries(entitlementsResult.entitlements).map(([key, entitlement]) => ({
    key,
    enabled: entitlement.enabled,
    limit: entitlement.limit?.toString() ?? null
  }));

  return {
    workspace: { id: workspaceId, name: workspace.name, status: workspace.status },
    access,
    subscription: workspace.subscriptionId
      ? {
          status: workspace.subscriptionStatus,
          planName: workspace.planName,
          startsAt: workspace.startsAt,
          expiresAt: workspace.expiresAt,
          trialEndsAt: workspace.trialEndsAt,
          renewalDueAt: workspace.renewalDueAt
        }
      : null,
    memberCount: Number(memberCountResult[0]?.total ?? 0),
    entitlements: entitlementEntries,
    latestPayment: latestPaymentResult[0] ?? null
  };
}
