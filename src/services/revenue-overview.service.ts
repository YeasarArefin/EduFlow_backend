import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../database/client";
import { paymentRequests, plans } from "../database/schema/subscriptions";
import { workspaces } from "../database/schema/workspaces";

export type RevenueOverviewInput = { from?: Date; to?: Date };

export async function getRevenueOverview(input: RevenueOverviewInput) {
  const filters = [];
  if (input.from) filters.push(gte(paymentRequests.createdAt, input.from));
  if (input.to) filters.push(lt(paymentRequests.createdAt, input.to));
  const where = filters.length ? and(...filters) : undefined;
  const [metrics, byPlan, recent] = await Promise.all([
    db.select({
      approvedRevenueMinor: sql<string>`coalesce(sum(case when ${paymentRequests.status} = 'approved' then ${paymentRequests.amountMinor} else 0 end), 0)`,
      pendingAmountMinor: sql<string>`coalesce(sum(case when ${paymentRequests.status} = 'pending' then ${paymentRequests.amountMinor} else 0 end), 0)`,
      pendingCount: sql<string>`count(*) filter (where ${paymentRequests.status} = 'pending')`,
      approvedCount: sql<string>`count(*) filter (where ${paymentRequests.status} = 'approved')`,
      rejectedCount: sql<string>`count(*) filter (where ${paymentRequests.status} = 'rejected')`,
    }).from(paymentRequests).where(where),
    db.select({ planId: plans.id, planName: plans.name, planSlug: plans.slug, revenueMinor: sql<string>`coalesce(sum(${paymentRequests.amountMinor}), 0)`, approvedCount: sql<string>`count(*)` })
      .from(paymentRequests).leftJoin(plans, eq(plans.id, paymentRequests.planId))
      .where(and(where, eq(paymentRequests.status, "approved")))
      .groupBy(plans.id, plans.name, plans.slug)
      .orderBy(desc(sql`sum(${paymentRequests.amountMinor})`)),
    db.select({ id: paymentRequests.id, status: paymentRequests.status, amountMinor: paymentRequests.amountMinor, method: paymentRequests.method, transactionId: paymentRequests.transactionId, createdAt: paymentRequests.createdAt, workspaceId: workspaces.id, workspaceName: workspaces.name, workspaceSlug: workspaces.slug, planId: plans.id, planName: plans.name, planSlug: plans.slug })
      .from(paymentRequests).leftJoin(workspaces, eq(workspaces.id, paymentRequests.workspaceId)).leftJoin(plans, eq(plans.id, paymentRequests.planId))
      .where(where).orderBy(desc(paymentRequests.createdAt)).limit(12),
  ]);

  return {
    metrics: {
      approvedRevenueMinor: metrics[0]?.approvedRevenueMinor ?? "0",
      pendingAmountMinor: metrics[0]?.pendingAmountMinor ?? "0",
      pendingCount: Number(metrics[0]?.pendingCount ?? 0),
      approvedCount: Number(metrics[0]?.approvedCount ?? 0),
      rejectedCount: Number(metrics[0]?.rejectedCount ?? 0),
    },
    byPlan: byPlan.map((item) => ({ plan: item.planId ? { id: item.planId, name: item.planName, slug: item.planSlug } : null, revenueMinor: item.revenueMinor, approvedCount: Number(item.approvedCount) })),
    recent: recent.map((item) => ({ ...item, amountMinor: item.amountMinor.toString(), workspace: item.workspaceId ? { id: item.workspaceId, name: item.workspaceName, slug: item.workspaceSlug } : null, plan: item.planId ? { id: item.planId, name: item.planName, slug: item.planSlug } : null })),
  };
}
