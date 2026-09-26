import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../database/client';
import { features, paymentRequests, planFeatures, plans, subscriptions } from '../database/schema/subscriptions';
import { AppError } from '../middleware/error-handler';
import { recordAuditLog } from './audit-log.service';
import type { DatabaseTransaction as DbTransaction } from '../types/common';
import type { PlanFeatureInput, PlanInput, PublicPlan } from '../types/subscription';

function mapPlan(plan: typeof plans.$inferSelect, features: (typeof planFeatures.$inferSelect)[]) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    priceMinor: plan.priceMinor.toString(),
    durationDays: plan.durationDays,
    trialDays: plan.trialDays,
    isActive: plan.isActive,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    features: features.map((feature) => ({
      featureKey: feature.featureKey,
      enabled: feature.enabled,
      limitValue: feature.limitValue?.toString() ?? null,
    })),
  };
}

async function saveFeatures(
  transaction: DbTransaction,
  planId: string,
  features: PlanFeatureInput[]
) {
  if (!features.length) return;
  await transaction
    .insert(planFeatures)
    .values(
      features.map((feature) => ({
        planId,
        featureKey: feature.featureKey,
        enabled: feature.enabled,
        limitValue: feature.limitValue,
      }))
    )
    .onConflictDoUpdate({
      target: [planFeatures.planId, planFeatures.featureKey],
      set: {
        enabled: sql`excluded.enabled`,
        limitValue: sql`excluded.limit_value`,
      },
    });
}

export async function listPlans() {
  const [plansRows, featureRows] = await Promise.all([
    db.select().from(plans).orderBy(desc(plans.isActive), asc(plans.createdAt)),
    db.select().from(planFeatures),
  ]);
  return plansRows.map((plan) =>
    mapPlan(
      plan,
      featureRows.filter((feature) => feature.planId === plan.id)
    )
  );
}

export async function listFeatureCatalog() {
  return db
    .select({ key: features.key, name: features.name, description: features.description })
    .from(features)
    .orderBy(asc(features.name));
}


export async function listActivePublicPlans(): Promise<PublicPlan[]> {
  const rows = await db
    .select({
      planId: plans.id,
      planName: plans.name,
      planSlug: plans.slug,
      priceMinor: plans.priceMinor,
      durationDays: plans.durationDays,
      trialDays: plans.trialDays,
      featureKey: features.key,
      featureName: features.name,
      featureDescription: features.description,
      defaultLimit: planFeatures.limitValue,
    })
    .from(plans)
    .leftJoin(planFeatures, and(eq(planFeatures.planId, plans.id), eq(planFeatures.enabled, true)))
    .leftJoin(features, eq(features.key, planFeatures.featureKey))
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.createdAt), asc(features.name));

  const publicPlans = new Map<string, PublicPlan>();
  for (const row of rows) {
    let plan = publicPlans.get(row.planId);
    if (!plan) {
      plan = {
        id: row.planId,
        name: row.planName,
        slug: row.planSlug,
        priceMinor: row.priceMinor.toString(),
        durationDays: row.durationDays,
        trial: { included: row.trialDays > 0, days: row.trialDays },
        features: [],
        quotas: {},
      };
      publicPlans.set(row.planId, plan);
    }

    if (row.featureKey && row.featureName) {
      const defaultLimit = row.defaultLimit?.toString() ?? null;
      plan.features.push({
        key: row.featureKey,
        name: row.featureName,
        description: row.featureDescription,
        defaultLimit,
      });
      plan.quotas[row.featureKey] = defaultLimit;
    }
  }

  return [...publicPlans.values()];
}

export async function createPlan(input: PlanInput, actorUserId: string) {
  try {
    return await db.transaction(async (transaction) => {
      const [plan] = await transaction
        .insert(plans)
        .values({
          name: input.name,
          slug: input.slug,
          priceMinor: input.priceMinor,
          durationDays: input.durationDays,
          trialDays: input.trialDays,
          isActive: input.isActive ?? true,
        })
        .returning();
      await saveFeatures(transaction, plan.id, input.features ?? []);
      await recordAuditLog(transaction, {
        actorUserId,
        action: 'plan.created',
        entityType: 'plan',
        entityId: plan.id,
        metadata: { planName: plan.name, status: plan.isActive ? 'active' : 'inactive' },
      });
      return mapPlan(
        plan,
        input.features?.map((feature) => ({
          planId: plan.id,
          featureKey: feature.featureKey,
          enabled: feature.enabled,
          limitValue: feature.limitValue,
        })) ?? []
      );
    });
  } catch (error) {
    const code =
      error && typeof error === 'object'
        ? ((error as { code?: string; cause?: { code?: string } }).code ??
          (error as { cause?: { code?: string } }).cause?.code)
        : undefined;
    if (code === '23505')
      throw new AppError('PLAN_SLUG_ALREADY_EXISTS', 'A plan with this slug already exists.', 409);
    if (code === '23503')
      throw new AppError(
        'PLAN_FEATURE_NOT_FOUND',
        'One or more selected features do not exist.',
        400
      );
    throw error;
  }
}

export async function updatePlan(id: string, input: Partial<PlanInput>, actorUserId: string) {
  try {
    return await db.transaction(async (transaction) => {
      const { features, ...updates } = input;
      const [plan] = await transaction
        .update(plans)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(plans.id, id))
        .returning();
      if (!plan) throw new AppError('PLAN_NOT_FOUND', 'The plan was not found.', 404);
      if (features) await saveFeatures(transaction, id, features);
      await recordAuditLog(transaction, {
        actorUserId,
        action: 'plan.updated',
        entityType: 'plan',
        entityId: id,
        metadata: { planName: plan.name, status: plan.isActive ? 'active' : 'inactive' },
      });
      const featureRows = await transaction
        .select()
        .from(planFeatures)
        .where(eq(planFeatures.planId, id));
      return mapPlan(plan, featureRows);
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code =
      error && typeof error === 'object'
        ? ((error as { code?: string; cause?: { code?: string } }).code ??
          (error as { cause?: { code?: string } }).cause?.code)
        : undefined;
    if (code === '23505')
      throw new AppError('PLAN_SLUG_ALREADY_EXISTS', 'A plan with this slug already exists.', 409);
    if (code === '23503')
      throw new AppError(
        'PLAN_FEATURE_NOT_FOUND',
        'One or more selected features do not exist.',
        400
      );
    throw error;
  }
}

export async function setPlanActive(id: string, isActive: boolean, actorUserId: string) {
  const [plan] = await db.transaction(async (transaction) => {
    const [updatedPlan] = await transaction
      .update(plans)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    if (updatedPlan)
      await recordAuditLog(transaction, {
        actorUserId,
        action: isActive ? 'plan.activated' : 'plan.deactivated',
        entityType: 'plan',
        entityId: id,
        metadata: { planName: updatedPlan.name, status: isActive ? 'active' : 'inactive' },
      });
    return [updatedPlan];
  });

  if (!plan) throw new AppError('PLAN_NOT_FOUND', 'The plan was not found.', 404);

  const features = await db.select().from(planFeatures).where(eq(planFeatures.planId, id));

  return mapPlan(plan, features);
}

export async function deletePlan(id: string, actorUserId: string) {
  return await db.transaction(async (transaction) => {
    const [existingPlan] = await transaction
      .select()
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);

    if (!existingPlan) {
      throw new AppError('PLAN_NOT_FOUND', 'The plan was not found.', 404);
    }

    // Check if any subscriptions reference this plan
    const [subscriptionUsage] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.planId, id));

    if (subscriptionUsage && Number(subscriptionUsage.count) > 0) {
      throw new AppError(
        'PLAN_IN_USE',
        'Cannot delete a plan that is associated with existing subscriptions. Deactivate it instead.',
        409
      );
    }

    // Check if any payment requests reference this plan
    const [paymentUsage] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentRequests)
      .where(eq(paymentRequests.planId, id));

    if (paymentUsage && Number(paymentUsage.count) > 0) {
      throw new AppError(
        'PLAN_IN_USE',
        'Cannot delete a plan that is referenced by payment records. Deactivate it instead.',
        409
      );
    }

    // Delete associated plan features
    await transaction.delete(planFeatures).where(eq(planFeatures.planId, id));

    // Delete the plan
    await transaction.delete(plans).where(eq(plans.id, id));

    await recordAuditLog(transaction, {
      actorUserId,
      action: 'plan.deleted',
      entityType: 'plan',
      entityId: id,
      metadata: { planName: existingPlan.name, slug: existingPlan.slug },
    });

    return { id, name: existingPlan.name, slug: existingPlan.slug };
  });
}
