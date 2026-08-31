import { and, desc, eq } from "drizzle-orm";
import { db } from "../database/client";
import { paymentRequests } from "../database/schema/subscriptions";
import { workspaces } from "../database/schema/workspaces";
import { resolveWorkspaceSubscriptionAccess } from "./subscription-access";

export type WorkspaceOnboardingStep =
  | "workspace_created"
  | "subscription_required"
  | "payment_pending"
  | "ready";

export async function getWorkspaceOnboardingState(workspaceId: string) {
  const [[workspace], [pendingPayment], access] = await Promise.all([
    db
      .select({ status: workspaces.status })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    db
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(and(eq(paymentRequests.workspaceId, workspaceId), eq(paymentRequests.status, "pending")))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(1),
    resolveWorkspaceSubscriptionAccess(workspaceId)
  ]);

  const hasPendingPayment = pendingPayment?.id !== undefined;
  const step: WorkspaceOnboardingStep = access.allowed
    ? "ready"
    : hasPendingPayment
      ? "payment_pending"
      : workspace?.status === "pending"
        ? "workspace_created"
        : "subscription_required";

  return {
    step,
    workspaceStatus: workspace?.status ?? "pending",
    paymentPending: hasPendingPayment,
    access
  };
}
