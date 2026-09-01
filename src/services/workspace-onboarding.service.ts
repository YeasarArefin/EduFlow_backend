import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../database/client";
import { workspaceRoleCodes } from "../database/schema/roles";
import { paymentRequests, plans, subscriptions } from "../database/schema/subscriptions";
import { workspaceMembers, workspaces, workspaceSettings } from "../database/schema/workspaces";
import { AppError } from "../middleware/error-handler";

export type CreateWorkspaceOnboardingInput = {
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: string;
};

export async function createWorkspaceOnboarding(
  createdByUserId: string,
  input: CreateWorkspaceOnboardingInput
) {
  try {
    return await db.transaction(async (transaction) => {
      const [existingMembership] = await transaction
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, createdByUserId))
        .limit(1)
        .for("update");
      if (existingMembership) {
        throw new AppError("WORKSPACE_ALREADY_EXISTS", "You already belong to a workspace.", 409);
      }

      const [approvedPurchase] = await transaction
        .select({ id: paymentRequests.id, planId: paymentRequests.planId })
        .from(paymentRequests)
        .where(
          and(
            eq(paymentRequests.requestedByUserId, createdByUserId),
            isNull(paymentRequests.workspaceId),
            eq(paymentRequests.purpose, "subscription"),
            eq(paymentRequests.status, "approved")
          )
        )
        .orderBy(desc(paymentRequests.createdAt))
        .limit(1)
        .for("update");
      if (!approvedPurchase?.planId) {
        throw new AppError("WORKSPACE_CREATION_NOT_UNLOCKED", "An approved plan purchase is required before creating a workspace.", 409);
      }

      const [plan] = await transaction
        .select({ durationDays: plans.durationDays })
        .from(plans)
        .where(eq(plans.id, approvedPurchase.planId))
        .limit(1);
      if (!plan) throw new AppError("PAYMENT_PLAN_NOT_FOUND", "The approved plan is no longer available.", 409);

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setUTCDate(expiresAt.getUTCDate() + plan.durationDays);
      const [workspace] = await transaction
        .insert(workspaces)
        .values({
          name: input.name,
          slug: input.slug,
          phone: input.phone,
          email: input.email,
          address: input.address,
          createdByUserId,
          status: "active",
          activatedAt: now
        })
        .returning({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          phone: workspaces.phone,
          email: workspaces.email,
          address: workspaces.address,
          status: workspaces.status,
          createdAt: workspaces.createdAt
        });

      await transaction.insert(workspaceSettings).values({ workspaceId: workspace.id });
      await transaction.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: createdByUserId,
        roleCode: workspaceRoleCodes.owner,
        joinedAt: new Date()
      });

      await transaction
        .update(paymentRequests)
        .set({ workspaceId: workspace.id, updatedAt: now })
        .where(and(eq(paymentRequests.id, approvedPurchase.id), isNull(paymentRequests.workspaceId)));
      await transaction.insert(subscriptions).values({
        workspaceId: workspace.id,
        planId: approvedPurchase.planId,
        status: "active",
        startsAt: now,
        expiresAt,
        renewalDueAt: expiresAt
      });

      return workspace;
    });
  } catch (error) {
    const databaseError =
      error && typeof error === "object" ? (error as { code?: string; cause?: { code?: string } }) : undefined;
    const databaseErrorCode = databaseError?.code ?? databaseError?.cause?.code;

    if (databaseErrorCode === "23505") {
      throw new AppError("WORKSPACE_SLUG_ALREADY_EXISTS", "This workspace slug is already in use.", 409);
    }

    throw error;
  }
}
