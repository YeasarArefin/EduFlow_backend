import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database/client";
import { paymentRequests } from "../database/schema/subscriptions";
import { workspaceMembers } from "../database/schema/workspaces";

export type AccountRoute = "dashboard" | "workspace_creation" | "payment_pending" | "account";

export async function getAccountRoutingState(userId: string): Promise<{ route: AccountRoute; workspaceId?: string }> {
  const [[membership], [purchase]] = await Promise.all([
    db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(desc(workspaceMembers.joinedAt), desc(workspaceMembers.createdAt))
      .limit(1),
    db
      .select({ status: paymentRequests.status })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.requestedByUserId, userId),
          isNull(paymentRequests.workspaceId),
          eq(paymentRequests.purpose, "subscription")
        )
      )
      .orderBy(desc(paymentRequests.createdAt))
      .limit(1)
  ]);

  if (membership) return { route: "dashboard", workspaceId: membership.workspaceId };
  if (purchase?.status === "approved") return { route: "workspace_creation" };
  if (purchase?.status === "pending") return { route: "payment_pending" };
  return { route: "account" };
}
