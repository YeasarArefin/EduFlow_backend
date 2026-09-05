import { and, asc, desc, eq } from "drizzle-orm";
import { withWorkspaceContext } from "../database/client";
import { batches, batchTeachers } from "../database/schema/batches";
import { teachers } from "../database/schema/teachers";
import { AppError } from "../middleware/error-handler";
import { recordAuditLog } from "./audit-log.service";

type AssignmentInput = { teacherId: string; isPrimary: boolean };

function duplicateAssignment(error: unknown): never {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") throw new AppError("BATCH_TEACHER_ALREADY_ASSIGNED", "This teacher is already assigned to the batch.", 409);
  throw error;
}

async function ensureBatch(tx: Parameters<Parameters<typeof withWorkspaceContext>[1]>[0], workspaceId: string, batchId: string) {
  const [batch] = await tx.select({ id: batches.id }).from(batches).where(and(eq(batches.id, batchId), eq(batches.workspaceId, workspaceId))).limit(1);
  if (!batch) throw new AppError("BATCH_NOT_FOUND", "The batch was not found.", 404);
}

export async function listBatchTeachers(workspaceId: string, batchId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    await ensureBatch(tx, workspaceId, batchId);
    return tx.select({ id: batchTeachers.id, teacherId: teachers.id, teacherCode: teachers.teacherCode, name: teachers.name, phone: teachers.phone, email: teachers.email, status: teachers.status, isPrimary: batchTeachers.isPrimary, assignedAt: batchTeachers.createdAt })
      .from(batchTeachers).innerJoin(teachers, and(eq(teachers.id, batchTeachers.teacherId), eq(teachers.workspaceId, workspaceId)))
      .where(and(eq(batchTeachers.workspaceId, workspaceId), eq(batchTeachers.batchId, batchId))).orderBy(desc(batchTeachers.isPrimary), asc(teachers.name));
  });
}

export async function assignBatchTeacher(workspaceId: string, actorUserId: string, batchId: string, input: AssignmentInput) {
  try {
    await withWorkspaceContext(workspaceId, async (tx) => {
      await ensureBatch(tx, workspaceId, batchId);
      const [teacher] = await tx.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.id, input.teacherId), eq(teachers.workspaceId, workspaceId))).limit(1);
      if (!teacher) throw new AppError("TEACHER_NOT_FOUND", "The teacher was not found in this workspace.", 400);
      if (input.isPrimary) await tx.update(batchTeachers).set({ isPrimary: false }).where(and(eq(batchTeachers.workspaceId, workspaceId), eq(batchTeachers.batchId, batchId)));
      await tx.insert(batchTeachers).values({ workspaceId, batchId, teacherId: input.teacherId, isPrimary: input.isPrimary });
      await recordAuditLog(tx, { actorUserId, action: "batch.teacher_assigned", entityType: "batch", entityId: batchId, workspaceId, metadata: { teacherId: input.teacherId, isPrimary: input.isPrimary } });
    });
    return listBatchTeachers(workspaceId, batchId);
  } catch (error) { return duplicateAssignment(error); }
}

export async function updateBatchTeacher(workspaceId: string, actorUserId: string, batchId: string, teacherId: string, isPrimary: boolean) {
  await withWorkspaceContext(workspaceId, async (tx) => {
    await ensureBatch(tx, workspaceId, batchId);
    const [assignment] = await tx.select({ id: batchTeachers.id }).from(batchTeachers).where(and(eq(batchTeachers.workspaceId, workspaceId), eq(batchTeachers.batchId, batchId), eq(batchTeachers.teacherId, teacherId))).limit(1);
    if (!assignment) throw new AppError("BATCH_TEACHER_NOT_FOUND", "The teacher is not assigned to this batch.", 404);
    if (isPrimary) await tx.update(batchTeachers).set({ isPrimary: false }).where(and(eq(batchTeachers.workspaceId, workspaceId), eq(batchTeachers.batchId, batchId)));
    await tx.update(batchTeachers).set({ isPrimary }).where(eq(batchTeachers.id, assignment.id));
    await recordAuditLog(tx, { actorUserId, action: "batch.teacher_updated", entityType: "batch", entityId: batchId, workspaceId, metadata: { teacherId, isPrimary } });
  });
  return listBatchTeachers(workspaceId, batchId);
}

export async function removeBatchTeacher(workspaceId: string, actorUserId: string, batchId: string, teacherId: string) {
  await withWorkspaceContext(workspaceId, async (tx) => {
    await ensureBatch(tx, workspaceId, batchId);
    const [assignment] = await tx.delete(batchTeachers).where(and(eq(batchTeachers.workspaceId, workspaceId), eq(batchTeachers.batchId, batchId), eq(batchTeachers.teacherId, teacherId))).returning({ id: batchTeachers.id });
    if (!assignment) throw new AppError("BATCH_TEACHER_NOT_FOUND", "The teacher is not assigned to this batch.", 404);
    await recordAuditLog(tx, { actorUserId, action: "batch.teacher_removed", entityType: "batch", entityId: batchId, workspaceId, metadata: { teacherId } });
  });
  return listBatchTeachers(workspaceId, batchId);
}
