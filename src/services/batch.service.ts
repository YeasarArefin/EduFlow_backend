import { and, count, desc, eq, ilike } from "drizzle-orm";
import type { z } from "zod";
import { withWorkspaceContext } from "../database/client";
import { academicGroups, classLevels, mediums } from "../database/schema/academics";
import { batches } from "../database/schema/batches";
import { AppError } from "../middleware/error-handler";
import { recordAuditLog } from "./audit-log.service";
import type { createBatchSchema, listBatchesQuerySchema, updateBatchSchema } from "../validation/batch.validation";

type CreateBatchInput = z.infer<typeof createBatchSchema>;
type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
type ListBatchesInput = z.infer<typeof listBatchesQuerySchema>;

function mapBatch(batch: typeof batches.$inferSelect) {
  const minor = Number(batch.monthlyFeeMinor);
  const monthlyFee = (minor / 100).toFixed(2).replace(/\.00$/, "");
  return {
    id: batch.id,
    name: batch.name,
    classLevelId: batch.classLevelId,
    mediumId: batch.mediumId,
    academicGroupId: batch.academicGroupId,
    startDate: batch.startDate,
    monthlyFeeMinor: batch.monthlyFeeMinor.toString(),
    monthlyFee,
    status: batch.status,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

function duplicateBatchName(error: unknown): never {
  const databaseError = error as { code?: string; cause?: { code?: string } };
  if (databaseError?.code === "23505" || databaseError?.cause?.code === "23505") {
    throw new AppError("BATCH_NAME_ALREADY_EXISTS", "A batch with this name already exists in this workspace.", 409);
  }
  throw error;
}

async function validateAcademicReferences(
  transaction: Parameters<Parameters<typeof withWorkspaceContext>[1]>[0],
  workspaceId: string,
  input: Pick<Partial<CreateBatchInput>, "classLevelId" | "mediumId" | "academicGroupId">,
) {
  if (input.classLevelId) {
    const [classLevel] = await transaction.select({ id: classLevels.id }).from(classLevels)
      .where(and(eq(classLevels.id, input.classLevelId), eq(classLevels.workspaceId, workspaceId))).limit(1);
    if (!classLevel) throw new AppError("ACADEMIC_REFERENCE_NOT_FOUND", "The class level was not found in this workspace.", 400);
  }

  if (input.mediumId) {
    const [medium] = await transaction.select({ id: mediums.id }).from(mediums)
      .where(and(eq(mediums.id, input.mediumId), eq(mediums.workspaceId, workspaceId))).limit(1);
    if (!medium) throw new AppError("ACADEMIC_REFERENCE_NOT_FOUND", "The medium was not found in this workspace.", 400);
  }

  if (input.academicGroupId) {
    const [academicGroup] = await transaction.select({ id: academicGroups.id }).from(academicGroups)
      .where(and(eq(academicGroups.id, input.academicGroupId), eq(academicGroups.workspaceId, workspaceId))).limit(1);
    if (!academicGroup) throw new AppError("ACADEMIC_REFERENCE_NOT_FOUND", "The academic group was not found in this workspace.", 400);
  }

}

export async function createBatch(workspaceId: string, actorUserId: string, input: CreateBatchInput) {
  try {
    const batchId = await withWorkspaceContext(workspaceId, async (transaction) => {
      await validateAcademicReferences(transaction, workspaceId, input);
      const [batch] = await transaction.insert(batches).values({
        workspaceId,
        name: input.name,
        classLevelId: input.classLevelId,
        mediumId: input.mediumId ?? null,
        academicGroupId: input.academicGroupId ?? null,
        startDate: input.startDate ?? null,
        monthlyFeeMinor: input.monthlyFeeMinor,
        status: input.status,
      }).returning({ id: batches.id });
      await recordAuditLog(transaction, { actorUserId, action: "batch.created", entityType: "batch", entityId: batch.id, workspaceId });
      return batch.id;
    });
    return getBatch(workspaceId, batchId);
  } catch (error) {
    return duplicateBatchName(error);
  }
}

export async function getBatch(workspaceId: string, batchId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const [row] = await transaction.select({
      batch: batches,
      classLevelName: classLevels.name,
      mediumName: mediums.name,
      academicGroupName: academicGroups.name,
    }).from(batches)
      .innerJoin(classLevels, and(eq(classLevels.id, batches.classLevelId), eq(classLevels.workspaceId, workspaceId)))
      .leftJoin(mediums, and(eq(mediums.id, batches.mediumId), eq(mediums.workspaceId, workspaceId)))
      .leftJoin(academicGroups, and(eq(academicGroups.id, batches.academicGroupId), eq(academicGroups.workspaceId, workspaceId)))
      .where(and(eq(batches.id, batchId), eq(batches.workspaceId, workspaceId))).limit(1);
    if (!row) throw new AppError("BATCH_NOT_FOUND", "The batch was not found.", 404);

    return {
      ...mapBatch(row.batch),
      classLevel: { id: row.batch.classLevelId, name: row.classLevelName },
      medium: row.batch.mediumId ? { id: row.batch.mediumId, name: row.mediumName } : null,
      academicGroup: row.batch.academicGroupId ? { id: row.batch.academicGroupId, name: row.academicGroupName } : null,
    };
  });
}

export async function listBatches(workspaceId: string, input: ListBatchesInput) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const filters = [eq(batches.workspaceId, workspaceId)];
    if (input.status) filters.push(eq(batches.status, input.status));
    if (input.search) filters.push(ilike(batches.name, `%${input.search}%`));
    const where = and(...filters);
    const [rows, totalResult] = await Promise.all([
      transaction.select().from(batches).where(where).orderBy(desc(batches.createdAt), desc(batches.id)).limit(input.limit).offset((input.page - 1) * input.limit),
      transaction.select({ total: count() }).from(batches).where(where),
    ]);
    const total = Number(totalResult[0]?.total ?? 0);
    return { data: rows.map(mapBatch), meta: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) } };
  });
}

export async function updateBatch(workspaceId: string, actorUserId: string, batchId: string, input: UpdateBatchInput) {
  try {
    await withWorkspaceContext(workspaceId, async (transaction) => {
      await validateAcademicReferences(transaction, workspaceId, input);
      const profile = input;
      const [batch] = await transaction.update(batches).set({ ...profile, updatedAt: new Date() })
        .where(and(eq(batches.id, batchId), eq(batches.workspaceId, workspaceId))).returning({ id: batches.id });
      if (!batch) throw new AppError("BATCH_NOT_FOUND", "The batch was not found.", 404);
      await recordAuditLog(transaction, { actorUserId, action: "batch.updated", entityType: "batch", entityId: batchId, workspaceId });
    });
    return getBatch(workspaceId, batchId);
  } catch (error) {
    return duplicateBatchName(error);
  }
}

export async function archiveBatch(workspaceId: string, actorUserId: string, batchId: string) {
  await withWorkspaceContext(workspaceId, async (transaction) => {
    const [batch] = await transaction.update(batches).set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(batches.id, batchId), eq(batches.workspaceId, workspaceId))).returning({ id: batches.id });
    if (!batch) throw new AppError("BATCH_NOT_FOUND", "The batch was not found.", 404);
    await recordAuditLog(transaction, { actorUserId, action: "batch.archived", entityType: "batch", entityId: batchId, workspaceId });
  });
  return getBatch(workspaceId, batchId);
}
