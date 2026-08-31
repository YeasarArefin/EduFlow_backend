import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../database/client";
import { planFeatures, plans } from "../database/schema/subscriptions";
import { AppError } from "../middleware/error-handler";

export type PlanFeatureInput = {
	featureKey: string;
	enabled: boolean;
	limitValue: bigint | null;
};
export type PlanInput = {
	name: string;
	slug: string;
	priceMinor: bigint;
	durationDays: number;
	trialDays: number;
	isActive?: boolean;
	features?: PlanFeatureInput[];
};
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
			limitValue: feature.limitValue?.toString() ?? null
		}))
	};
}

async function saveFeatures(transaction: DbTransaction, planId: string, features: PlanFeatureInput[]) {
	if (!features.length) return;
	await transaction
		.insert(planFeatures)
		.values(
			features.map((feature) => ({
				planId,
				featureKey: feature.featureKey,
				enabled: feature.enabled,
				limitValue: feature.limitValue
			}))
		)
		.onConflictDoUpdate({
			target: [planFeatures.planId, planFeatures.featureKey],
			set: {
				enabled: sql`excluded.enabled`,
				limitValue: sql`excluded.limit_value`
			}
		});
}

export async function listPlans() {
	const [plansRows, featureRows] = await Promise.all([
		db.select().from(plans).orderBy(desc(plans.isActive), asc(plans.createdAt)),
		db.select().from(planFeatures)
	]);
	return plansRows.map((plan) =>
		mapPlan(
			plan,
			featureRows.filter((feature) => feature.planId === plan.id)
		)
	);
}

export async function createPlan(input: PlanInput) {
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
					isActive: input.isActive ?? true
				})
				.returning();
			await saveFeatures(transaction, plan.id, input.features ?? []);
			return mapPlan(
				plan,
				input.features?.map((feature) => ({
					planId: plan.id,
					featureKey: feature.featureKey,
					enabled: feature.enabled,
					limitValue: feature.limitValue
				})) ?? []
			);
		});
	} catch (error) {
		const code =
			error && typeof error === "object"
				? ((error as { code?: string; cause?: { code?: string; }; }).code ??
					(error as { cause?: { code?: string; }; }).cause?.code)
				: undefined;
		if (code === "23505") throw new AppError("PLAN_SLUG_ALREADY_EXISTS", "A plan with this slug already exists.", 409);
		if (code === "23503")
			throw new AppError("PLAN_FEATURE_NOT_FOUND", "One or more selected features do not exist.", 400);
		throw error;
	}
}

export async function updatePlan(id: string, input: Partial<PlanInput>) {
	try {
		return await db.transaction(async (transaction) => {
			const { features, ...updates } = input;
			const [plan] = await transaction
				.update(plans)
				.set({ ...updates, updatedAt: new Date() })
				.where(eq(plans.id, id))
				.returning();
			if (!plan) throw new AppError("PLAN_NOT_FOUND", "The plan was not found.", 404);
			if (features) await saveFeatures(transaction, id, features);
			const featureRows = await transaction.select().from(planFeatures).where(eq(planFeatures.planId, id));
			return mapPlan(plan, featureRows);
		});
	} catch (error) {
		if (error instanceof AppError) throw error;
		const code =
			error && typeof error === "object"
				? ((error as { code?: string; cause?: { code?: string; }; }).code ??
					(error as { cause?: { code?: string; }; }).cause?.code)
				: undefined;
		if (code === "23505") throw new AppError("PLAN_SLUG_ALREADY_EXISTS", "A plan with this slug already exists.", 409);
		if (code === "23503")
			throw new AppError("PLAN_FEATURE_NOT_FOUND", "One or more selected features do not exist.", 400);
		throw error;
	}
}

export async function setPlanActive(id: string, isActive: boolean) {
	const [plan] = await db.update(plans).set({ isActive, updatedAt: new Date() }).where(eq(plans.id, id)).returning();

	if (!plan) throw new AppError("PLAN_NOT_FOUND", "The plan was not found.", 404);

	const features = await db.select().from(planFeatures).where(eq(planFeatures.planId, id));

	return mapPlan(plan, features);
}
