import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../database/client";
import { user } from "../database/schema/auth";
import { auditLogs } from "../database/schema/platform";
import { workspaces } from "../database/schema/workspaces";

type AuditExecutor = Pick<typeof db, "insert">;

export type AuditLogInput = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  workspaceId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordAuditLog(executor: AuditExecutor, input: AuditLogInput) {
  await executor.insert(auditLogs).values({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    workspaceId: input.workspaceId ?? null,
    metadata: input.metadata
  });
}

export type ActivityListInput = {
  page: number;
  limit: number;
  search?: string;
  category?: "payment" | "plan" | "entitlement" | "lifecycle";
};

function summarizeMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const allowed = ["status", "planName", "featureKey", "reason", "scheduledDeleteAt"] as const;
  const values = allowed.flatMap((key) => {
    const value = metadata[key];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? [{ key, value: String(value) }]
      : [];
  });
  return values.length ? values : null;
}

export async function listPlatformActivity(input: ActivityListInput) {
  const filters = [];
  if (input.category) filters.push(sql`${auditLogs.action} like ${`${input.category}.%`}`);
  if (input.search) {
    const term = `%${input.search}%`;
    filters.push(or(ilike(auditLogs.action, term), ilike(auditLogs.entityId, term), ilike(workspaces.name, term), ilike(workspaces.slug, term), ilike(user.name, term), ilike(user.email, term))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const offset = (input.page - 1) * input.limit;
  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actor: { id: user.id, name: user.name, email: user.email },
        workspace: { id: workspaces.id, name: workspaces.name, slug: workspaces.slug }
      })
      .from(auditLogs)
      .leftJoin(user, eq(user.id, auditLogs.actorUserId))
      .leftJoin(workspaces, eq(workspaces.id, auditLogs.workspaceId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(auditLogs).leftJoin(user, eq(user.id, auditLogs.actorUserId)).leftJoin(workspaces, eq(workspaces.id, auditLogs.workspaceId)).where(where)
  ]);
  const total = Number(totalResult[0]?.total ?? 0);
  return {
    data: rows.map((row) => ({
      ...row,
      actor: row.actor?.id ? row.actor : null,
      workspace: row.workspace?.id ? row.workspace : null,
      metadataSummary: summarizeMetadata(row.metadata)
    })),
    meta: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) }
  };
}
