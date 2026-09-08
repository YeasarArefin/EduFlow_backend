import { and, count, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { withWorkspaceContext } from "../database/client";
import { attendanceRecords, attendanceSessions } from "../database/schema/attendance";
import { batchEnrollments, batches } from "../database/schema/batches";
import { students } from "../database/schema/students";
import { AppError } from "../middleware/error-handler";
import type { bulkSaveAttendanceSchema, createAttendanceSessionSchema, listAttendanceSessionsQuerySchema } from "../validation/attendance.validation";
import { recordAuditLog } from "./audit-log.service";

type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;
type BulkSaveAttendanceInput = z.infer<typeof bulkSaveAttendanceSchema>;
type ListAttendanceSessionsInput = z.infer<typeof listAttendanceSessionsQuerySchema>;
type Transaction = Parameters<Parameters<typeof withWorkspaceContext>[1]>[0];

function attendanceSessionNotFound(): never {
  throw new AppError("ATTENDANCE_SESSION_NOT_FOUND", "The attendance session was not found.", 404);
}

function mapSession(row: typeof attendanceSessions.$inferSelect, batch: { id: string; name: string }) {
  return { id: row.id, batchId: row.batchId, sessionDate: row.sessionDate, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, batch };
}

async function findSession(transaction: Transaction, workspaceId: string, sessionId: string) {
  const [row] = await transaction.select({ session: attendanceSessions, batch: { id: batches.id, name: batches.name } })
    .from(attendanceSessions)
    .innerJoin(batches, and(eq(batches.id, attendanceSessions.batchId), eq(batches.workspaceId, workspaceId)))
    .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.workspaceId, workspaceId))).limit(1);
  if (!row) attendanceSessionNotFound();
  return row;
}

export async function getAttendanceSession(workspaceId: string, sessionId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const session = await findSession(transaction, workspaceId, sessionId);
    const records = await transaction.select({
      id: attendanceRecords.id, studentId: attendanceRecords.studentId, status: attendanceRecords.status,
      createdAt: attendanceRecords.createdAt, updatedAt: attendanceRecords.updatedAt,
      student: { id: students.id, studentCode: students.studentCode, fullName: students.fullName, phone: students.phone },
    }).from(attendanceRecords)
      .innerJoin(students, and(eq(students.id, attendanceRecords.studentId), eq(students.workspaceId, workspaceId)))
      .where(and(eq(attendanceRecords.attendanceSessionId, sessionId), eq(attendanceRecords.workspaceId, workspaceId)))
      .orderBy(students.fullName, students.id);
    return { ...mapSession(session.session, session.batch), records };
  });
}

export async function createAttendanceSession(workspaceId: string, actorUserId: string, input: CreateAttendanceSessionInput) {
  try {
    const sessionId = await withWorkspaceContext(workspaceId, async (transaction) => {
      const [batch] = await transaction.select({ id: batches.id, status: batches.status }).from(batches)
        .where(and(eq(batches.id, input.batchId), eq(batches.workspaceId, workspaceId))).limit(1);
      if (!batch) throw new AppError("BATCH_NOT_FOUND", "The batch was not found.", 404);
      if (batch.status !== "active") throw new AppError("BATCH_NOT_ACTIVE", "Attendance can only be created for an active batch.", 409);
      const [session] = await transaction.insert(attendanceSessions).values({ workspaceId, batchId: input.batchId, sessionDate: input.sessionDate }).returning({ id: attendanceSessions.id });
      const roster = await transaction.select({ studentId: batchEnrollments.studentId }).from(batchEnrollments)
        .innerJoin(students, and(eq(students.id, batchEnrollments.studentId), eq(students.workspaceId, workspaceId)))
        .where(and(
          eq(batchEnrollments.workspaceId, workspaceId), eq(batchEnrollments.batchId, input.batchId), eq(batchEnrollments.status, "active"), eq(students.status, "active"),
          sql`${batchEnrollments.enrolledAt} <= ${input.sessionDate}::date`,
          sql`(${batchEnrollments.endedAt} is null or ${batchEnrollments.endedAt} >= ${input.sessionDate}::date)`,
        ));
      if (roster.length) await transaction.insert(attendanceRecords).values(roster.map(({ studentId }) => ({ workspaceId, attendanceSessionId: session.id, studentId, status: "absent" as const })));
      await recordAuditLog(transaction, { actorUserId, workspaceId, action: "attendance.session_created", entityType: "attendance_session", entityId: session.id, metadata: { batchId: input.batchId, sessionDate: input.sessionDate, rosterCount: roster.length } });
      return session.id;
    });
    return getAttendanceSession(workspaceId, sessionId);
  } catch (error) {
    const databaseError = error && typeof error === "object" ? error as { code?: string; cause?: { code?: string } } : undefined;
    if (databaseError?.code === "23505" || databaseError?.cause?.code === "23505") throw new AppError("ATTENDANCE_SESSION_ALREADY_EXISTS", "An attendance session already exists for this batch and date.", 409);
    throw error;
  }
}

export async function listAttendanceSessions(workspaceId: string, input: ListAttendanceSessionsInput) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const where = and(eq(attendanceSessions.workspaceId, workspaceId), input.batchId ? eq(attendanceSessions.batchId, input.batchId) : undefined, input.sessionDate ? eq(attendanceSessions.sessionDate, input.sessionDate) : undefined, input.status ? eq(attendanceSessions.status, input.status) : undefined);
    const [rows, totalRows] = await Promise.all([
      transaction.select({ session: attendanceSessions, batch: { id: batches.id, name: batches.name }, rosterCount: sql<number>`(select count(*)::integer from attendance_records r where r.attendance_session_id = ${attendanceSessions.id} and r.workspace_id = ${workspaceId}::uuid)`, presentCount: sql<number>`(select count(*)::integer from attendance_records r where r.attendance_session_id = ${attendanceSessions.id} and r.workspace_id = ${workspaceId}::uuid and r.status = 'present')` }).from(attendanceSessions).innerJoin(batches, and(eq(batches.id, attendanceSessions.batchId), eq(batches.workspaceId, workspaceId))).where(where).orderBy(desc(attendanceSessions.sessionDate), desc(attendanceSessions.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit),
      transaction.select({ total: count() }).from(attendanceSessions).where(where),
    ]);
    const total = totalRows[0]?.total ?? 0;
    return { data: rows.map((row) => ({ ...mapSession(row.session, row.batch), rosterCount: Number(row.rosterCount), presentCount: Number(row.presentCount), absentCount: Number(row.rosterCount) - Number(row.presentCount) })), meta: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
  });
}

export async function saveAttendance(workspaceId: string, actorUserId: string, sessionId: string, input: BulkSaveAttendanceInput) {
  await withWorkspaceContext(workspaceId, async (transaction) => {
    const session = await findSession(transaction, workspaceId, sessionId);
    if (session.session.status === "finalized") throw new AppError("ATTENDANCE_SESSION_FINALIZED", "Finalized attendance sessions cannot be changed.", 409);
    const values = sql.join(input.records.map((record) => sql`(${record.studentId}::uuid, ${record.status}::attendance_status)`), sql`, `);
    const result = await transaction.execute<{ student_id: string }>(sql`update attendance_records as record set status = source.status, updated_at = now() from (values ${values}) as source(student_id, status) where record.attendance_session_id = ${sessionId}::uuid and record.workspace_id = ${workspaceId}::uuid and record.student_id = source.student_id returning record.student_id`);
    if (result.rows.length !== input.records.length) throw new AppError("ATTENDANCE_ROSTER_MISMATCH", "Every attendance record must belong to this session's roster.", 400);
    await recordAuditLog(transaction, { actorUserId, workspaceId, action: "attendance.records_saved", entityType: "attendance_session", entityId: sessionId, metadata: { recordCount: input.records.length } });
  });
  return getAttendanceSession(workspaceId, sessionId);
}

export async function finalizeAttendanceSession(workspaceId: string, actorUserId: string, sessionId: string) {
  await withWorkspaceContext(workspaceId, async (transaction) => {
    const session = await findSession(transaction, workspaceId, sessionId);
    if (session.session.status === "finalized") throw new AppError("ATTENDANCE_SESSION_FINALIZED", "This attendance session is already finalized.", 409);
    await transaction.update(attendanceSessions).set({ status: "finalized", updatedAt: new Date() }).where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.workspaceId, workspaceId), eq(attendanceSessions.status, "draft")));
    await recordAuditLog(transaction, { actorUserId, workspaceId, action: "attendance.session_finalized", entityType: "attendance_session", entityId: sessionId });
  });
  return getAttendanceSession(workspaceId, sessionId);
}
