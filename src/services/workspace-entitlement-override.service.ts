import { and, desc, eq } from "drizzle-orm";
import { db } from "../database/client";
import { AppError } from "../middleware/error-handler";
import { workspaceEntitlementOverrides } from "../database/schema/subscriptions";
import { workspaces } from "../database/schema/workspaces";
import { recordAuditLog } from "./audit-log.service";

export type EntitlementOverrideInput = {
  featureKey: string;
  enabledOverride: boolean | null;
  limitOverride: bigint | null;
  reason: string;
  expiresAt: Date | null;
};

function mapOverride(row: typeof workspaceEntitlementOverrides.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    featureKey: row.featureKey,
    enabledOverride: row.enabledOverride,
    limitOverride: row.limitOverride?.toString() ?? null,
    reason: row.reason,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function assertWorkspace(workspaceId: string) {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new AppError("WORKSPACE_NOT_FOUND", "The workspace was not found.", 404);
}

function mapDatabaseError(error: unknown): never {
  const code =
    error && typeof error === "object"
      ? ((error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code)
      : undefined;
  if (code === "23503")
    throw new AppError("ENTITLEMENT_FEATURE_NOT_FOUND", "The selected feature does not exist.", 400);
  if (code === "23505")
    throw new AppError(
      "ENTITLEMENT_OVERRIDE_ALREADY_EXISTS",
      "An override already exists for this workspace feature.",
      409
    );
  throw error;
}

export async function listWorkspaceEntitlementOverrides(workspaceId: string) {
  await assertWorkspace(workspaceId);
  const rows = await db
    .select()
    .from(workspaceEntitlementOverrides)
    .where(eq(workspaceEntitlementOverrides.workspaceId, workspaceId))
    .orderBy(desc(workspaceEntitlementOverrides.createdAt));
  return rows.map(mapOverride);
}

export async function createWorkspaceEntitlementOverride(workspaceId: string, input: EntitlementOverrideInput, actorUserId: string) {
  await assertWorkspace(workspaceId);
  try {
    const [row] = await db
      .insert(workspaceEntitlementOverrides)
      .values({ workspaceId, ...input })
      .returning();
    await recordAuditLog(db, { actorUserId, action: "entitlement.created", entityType: "entitlement_override", entityId: row.id, workspaceId, metadata: { featureKey: row.featureKey, reason: row.reason } });
    return mapOverride(row);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateWorkspaceEntitlementOverride(
  workspaceId: string,
  id: string,
  input: Partial<EntitlementOverrideInput>,
  actorUserId: string
) {
  try {
    return await db.transaction(async (transaction) => {
      const [row] = await transaction
        .update(workspaceEntitlementOverrides)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(workspaceEntitlementOverrides.id, id), eq(workspaceEntitlementOverrides.workspaceId, workspaceId))
        )
        .returning();
      if (!row) throw new AppError("ENTITLEMENT_OVERRIDE_NOT_FOUND", "The entitlement override was not found.", 404);
      await recordAuditLog(transaction, { actorUserId, action: "entitlement.updated", entityType: "entitlement_override", entityId: row.id, workspaceId, metadata: { featureKey: row.featureKey, reason: row.reason } });
      return mapOverride(row);
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    mapDatabaseError(error);
  }
}

export async function removeWorkspaceEntitlementOverride(workspaceId: string, id: string, actorUserId: string) {
  await db.transaction(async (transaction) => {
    const [row] = await transaction.delete(workspaceEntitlementOverrides).where(and(eq(workspaceEntitlementOverrides.id, id), eq(workspaceEntitlementOverrides.workspaceId, workspaceId))).returning({ id: workspaceEntitlementOverrides.id, featureKey: workspaceEntitlementOverrides.featureKey });
    if (!row) throw new AppError("ENTITLEMENT_OVERRIDE_NOT_FOUND", "The entitlement override was not found.", 404);
    await recordAuditLog(transaction, { actorUserId, action: "entitlement.removed", entityType: "entitlement_override", entityId: row.id, workspaceId, metadata: { featureKey: row.featureKey } });
  });
}
