import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../database/client";
import { plans, subscriptions, paymentRequests, workspaceEntitlementOverrides } from "../database/schema/subscriptions";
import { workspaces } from "../database/schema/workspaces";
import { deriveSubscriptionAccessState, type SubscriptionAccessStatus } from "./subscription-access";
import { AppError } from "../middleware/error-handler";

export const workspaceListSubscriptionStatuses = [
  "trial",
  "pending",
  "active",
  "renewal_due",
  "expired",
  "cancelled",
  "suspended"
] as const;
export const workspaceListWorkspaceStatuses = [
  "pending",
  "active",
  "locked",
  "suspended",
  "scheduled_deletion",
  "deleted"
] as const;
export const workspaceListAccessStatuses = [
  "verification_pending",
  "payment_pending",
  "trial",
  "active",
  "renewal_due",
  "subscription_expired",
  "locked",
  "scheduled_for_deletion",
  "suspended"
] as const satisfies readonly SubscriptionAccessStatus[];

export type ListWorkspacesInput = {
  page: number;
  limit: number;
  search?: string;
  workspaceStatus?: (typeof workspaceListWorkspaceStatuses)[number];
  subscriptionStatus?: (typeof workspaceListSubscriptionStatuses)[number];
  accessStatus?: SubscriptionAccessStatus;
  lifecycleQueue?: boolean;
};

const accessStatusExpression = (now: Date) => sql<string>`case
  when ${workspaces.status} in ('locked', 'deleted') then 'locked'
  when ${workspaces.status} = 'scheduled_deletion' then 'scheduled_for_deletion'
  when ${workspaces.status} = 'suspended' then 'suspended'
  when ${workspaces.status} = 'pending' then 'verification_pending'
  when ${subscriptions.id} is null then 'payment_pending'
  when ${subscriptions.startsAt} > ${now} then 'payment_pending'
  when ${subscriptions.status} in ('expired', 'cancelled', 'suspended') then 'subscription_expired'
  when ${subscriptions.status} = 'trial' and ${subscriptions.trialEndsAt} is not null and ${subscriptions.trialEndsAt} <= ${now} then 'subscription_expired'
  when ${subscriptions.status} in ('active', 'renewal_due') and ${subscriptions.expiresAt} is not null and ${subscriptions.expiresAt} <= ${now} then 'subscription_expired'
  when ${subscriptions.status} = 'pending' then 'payment_pending'
  else ${subscriptions.status} end`;

export async function listWorkspaces(input: ListWorkspacesInput) {
  const now = new Date();
  const filters = [];
  if (input.search)
    filters.push(or(ilike(workspaces.name, `%${input.search}%`), ilike(workspaces.slug, `%${input.search}%`)));
  if (input.workspaceStatus) filters.push(eq(workspaces.status, input.workspaceStatus));
  if (input.subscriptionStatus) filters.push(eq(subscriptions.status, input.subscriptionStatus));
  if (input.accessStatus) filters.push(eq(accessStatusExpression(now), input.accessStatus));
  if (input.lifecycleQueue) filters.push(inArray(workspaces.status, ["locked", "scheduled_deletion"]));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        workspaceStatus: workspaces.status,
        createdAt: workspaces.createdAt,
        lockedAt: workspaces.lockedAt,
        scheduledDeleteAt: workspaces.scheduledDeleteAt,
        subscriptionId: subscriptions.id,
        subscriptionStatus: subscriptions.status,
        startsAt: subscriptions.startsAt,
        expiresAt: subscriptions.expiresAt,
        trialEndsAt: subscriptions.trialEndsAt,
        planId: plans.id,
        planName: plans.name,
        planSlug: plans.slug
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
      .where(where)
      .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db
      .select({ total: count() })
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
      .where(where)
  ]);
  return {
    data: rows.map((row) => {
      const access = deriveSubscriptionAccessState({
        workspaceStatus: row.workspaceStatus,
        subscription: row.subscriptionStatus
          ? {
              status: row.subscriptionStatus,
              startsAt: row.startsAt,
              expiresAt: row.expiresAt,
              trialEndsAt: row.trialEndsAt
            }
          : null,
        now
      });
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        workspaceStatus: row.workspaceStatus,
        createdAt: row.createdAt,
        lockedAt: row.lockedAt,
        scheduledDeleteAt: row.scheduledDeleteAt,
        subscription: row.subscriptionId
          ? {
              id: row.subscriptionId,
              status: row.subscriptionStatus,
              startsAt: row.startsAt,
              expiresAt: row.expiresAt,
              trialEndsAt: row.trialEndsAt,
              plan: row.planId ? { id: row.planId, name: row.planName, slug: row.planSlug } : null
            }
          : null,
        access: {
          allowed: access.allowed,
          status: access.status,
          reason: access.reason
        }
      };
    }),
    total: Number(totalRows[0]?.total ?? 0)
  };
}

export async function getWorkspaceDetail(workspaceId: string) {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      phone: workspaces.phone,
      email: workspaces.email,
      address: workspaces.address,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
      activatedAt: workspaces.activatedAt,
      lockedAt: workspaces.lockedAt,
      scheduledDeleteAt: workspaces.scheduledDeleteAt,
      subscriptionId: subscriptions.id,
      subscriptionStatus: subscriptions.status,
      startsAt: subscriptions.startsAt,
      expiresAt: subscriptions.expiresAt,
      trialEndsAt: subscriptions.trialEndsAt,
      renewalDueAt: subscriptions.renewalDueAt,
      cancelledAt: subscriptions.cancelledAt,
      planId: plans.id,
      planName: plans.name,
      planSlug: plans.slug,
      planPriceMinor: plans.priceMinor,
      planDurationDays: plans.durationDays,
      planTrialDays: plans.trialDays
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
    .limit(1);
  if (!workspace) throw new AppError("WORKSPACE_NOT_FOUND", "The workspace was not found.", 404);

  const [history, payments, overrides] = await Promise.all([
    db
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        planName: plans.name,
        planSlug: plans.slug,
        status: subscriptions.status,
        startsAt: subscriptions.startsAt,
        expiresAt: subscriptions.expiresAt,
        trialEndsAt: subscriptions.trialEndsAt,
        renewalDueAt: subscriptions.renewalDueAt,
        createdAt: subscriptions.createdAt
      })
      .from(subscriptions)
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.workspaceId, workspaceId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(10),
    db
      .select({
        id: paymentRequests.id,
        purpose: paymentRequests.purpose,
        planId: paymentRequests.planId,
        planName: plans.name,
        planSlug: plans.slug,
        amountMinor: paymentRequests.amountMinor,
        method: paymentRequests.method,
        transactionId: paymentRequests.transactionId,
        status: paymentRequests.status,
        reviewedAt: paymentRequests.reviewedAt,
        createdAt: paymentRequests.createdAt
      })
      .from(paymentRequests)
      .leftJoin(plans, eq(plans.id, paymentRequests.planId))
      .where(eq(paymentRequests.workspaceId, workspaceId))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(10),
    db
      .select({
        id: workspaceEntitlementOverrides.id,
        featureKey: workspaceEntitlementOverrides.featureKey,
        enabled: workspaceEntitlementOverrides.enabledOverride,
        limit: workspaceEntitlementOverrides.limitOverride,
        reason: workspaceEntitlementOverrides.reason,
        expiresAt: workspaceEntitlementOverrides.expiresAt,
        createdAt: workspaceEntitlementOverrides.createdAt
      })
      .from(workspaceEntitlementOverrides)
      .where(
        and(
          eq(workspaceEntitlementOverrides.workspaceId, workspaceId),
          or(isNull(workspaceEntitlementOverrides.expiresAt), gt(workspaceEntitlementOverrides.expiresAt, new Date()))
        )
      )
      .orderBy(desc(workspaceEntitlementOverrides.createdAt))
  ]);
  const now = new Date();
  const access = deriveSubscriptionAccessState({
    workspaceStatus: workspace.status,
    subscription: workspace.subscriptionStatus
      ? {
          status: workspace.subscriptionStatus,
          startsAt: workspace.startsAt,
          expiresAt: workspace.expiresAt,
          trialEndsAt: workspace.trialEndsAt
        }
      : null,
    now
  });
  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      phone: workspace.phone,
      email: workspace.email,
      address: workspace.address,
      status: workspace.status,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      activatedAt: workspace.activatedAt,
      lockedAt: workspace.lockedAt,
      scheduledDeleteAt: workspace.scheduledDeleteAt
    },
    subscription: workspace.subscriptionId
      ? {
          id: workspace.subscriptionId,
          status: workspace.subscriptionStatus,
          startsAt: workspace.startsAt,
          expiresAt: workspace.expiresAt,
          trialEndsAt: workspace.trialEndsAt,
          renewalDueAt: workspace.renewalDueAt,
          cancelledAt: workspace.cancelledAt,
          plan: workspace.planId
            ? {
                id: workspace.planId,
                name: workspace.planName,
                slug: workspace.planSlug,
                priceMinor: workspace.planPriceMinor?.toString(),
                durationDays: workspace.planDurationDays,
                trialDays: workspace.planTrialDays
              }
            : null
        }
      : null,
    access,
    subscriptionHistory: history.map((item) => ({
      ...item,
      plan: item.planId ? { id: item.planId, name: item.planName, slug: item.planSlug } : null
    })),
    recentPayments: payments.map((item) => ({
      ...item,
      amountMinor: item.amountMinor.toString(),
      plan: item.planId ? { id: item.planId, name: item.planName, slug: item.planSlug } : null
    })),
    activeEntitlementOverrides: overrides.map((item) => ({
      ...item,
      limit: item.limit?.toString() ?? null
    }))
  };
}
