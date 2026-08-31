import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "../database/client";
import {
  planFeatures,
  subscriptions,
  workspaceEntitlementOverrides,
} from "../database/schema/subscriptions";

const currentSubscriptionStatuses = ["trial", "pending", "active", "renewal_due"] as const;
type CurrentSubscriptionStatus = (typeof currentSubscriptionStatuses)[number];

export type WorkspaceEntitlement = {
  enabled: boolean;
  limit: bigint | null;
};

export type EffectiveWorkspaceEntitlements = {
  workspaceId: string;
  subscription: {
    id: string;
    planId: string;
    status: CurrentSubscriptionStatus;
  } | null;
  entitlements: Record<string, WorkspaceEntitlement>;
};

export async function resolveWorkspaceEntitlements(
  workspaceId: string,
): Promise<EffectiveWorkspaceEntitlements> {
  const [currentSubscription] = await db
    .select({ id: subscriptions.id, planId: subscriptions.planId, status: subscriptions.status })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        inArray(subscriptions.status, currentSubscriptionStatuses),
      ),
    )
    .limit(1);

  if (!currentSubscription) {
    return { workspaceId, subscription: null, entitlements: {} };
  }

  const [planDefaults, overrides] = await Promise.all([
    db
      .select({
        featureKey: planFeatures.featureKey,
        enabled: planFeatures.enabled,
        limit: planFeatures.limitValue,
      })
      .from(planFeatures)
      .where(eq(planFeatures.planId, currentSubscription.planId)),
    db
      .select({
        featureKey: workspaceEntitlementOverrides.featureKey,
        enabled: workspaceEntitlementOverrides.enabledOverride,
        limit: workspaceEntitlementOverrides.limitOverride,
      })
      .from(workspaceEntitlementOverrides)
      .where(
        and(
          eq(workspaceEntitlementOverrides.workspaceId, workspaceId),
          or(isNull(workspaceEntitlementOverrides.expiresAt), gt(workspaceEntitlementOverrides.expiresAt, new Date())),
        ),
      ),
  ]);

  const entitlements: Record<string, WorkspaceEntitlement> = {};
  for (const feature of planDefaults) {
    entitlements[feature.featureKey] = { enabled: feature.enabled, limit: feature.limit };
  }

  for (const override of overrides) {
    const current = entitlements[override.featureKey] ?? { enabled: false, limit: null };
    entitlements[override.featureKey] = {
      enabled: override.enabled ?? current.enabled,
      limit: override.limit ?? current.limit,
    };
  }

  return {
    workspaceId,
    subscription: {
      ...currentSubscription,
      status: currentSubscription.status as CurrentSubscriptionStatus,
    },
    entitlements,
  };
}
