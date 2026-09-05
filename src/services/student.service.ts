import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { withWorkspaceContext } from "../database/client";
import { students } from "../database/schema/students";
import { AppError } from "../middleware/error-handler";
import { recordAuditLog } from "./audit-log.service";
import type { z } from "zod";
import type { createStudentSchema, listStudentsQuerySchema, updateStudentSchema } from "../validation/student.validation";

type CreateStudentInput = z.infer<typeof createStudentSchema>;
type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
type ListStudentsInput = z.infer<typeof listStudentsQuerySchema>;

function mapStudent(student: typeof students.$inferSelect) {
  return {
    id: student.id,
    studentCode: student.studentCode,
    fullName: student.fullName,
    phone: student.phone,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    address: student.address,
    gender: student.gender,
    admissionDate: student.admissionDate,
    status: student.status,
    notes: student.notes,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt
  };
}

function normalizeNullableFields<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === "" ? null : value])) as T;
}

function asStudentError(error: unknown): never {
  const databaseError = error && typeof error === "object" ? (error as { code?: string; cause?: { code?: string } }) : undefined;
  if (databaseError?.code === "23505" || databaseError?.cause?.code === "23505") {
    throw new AppError("STUDENT_CODE_ALREADY_EXISTS", "A student with this code already exists in this workspace.", 409);
  }
  throw error;
}

export async function createStudent(workspaceId: string, actorUserId: string, input: CreateStudentInput) {
  try {
    return await withWorkspaceContext(workspaceId, async (transaction) => {
      const [student] = await transaction
        .insert(students)
        .values({ workspaceId, ...normalizeNullableFields(input) })
        .returning();
      await recordAuditLog(transaction, { actorUserId, action: "student.created", entityType: "student", entityId: student.id, workspaceId });
      return mapStudent(student);
    });
  } catch (error) {
    return asStudentError(error);
  }
}

export async function getStudent(workspaceId: string, studentId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const [student] = await transaction.select().from(students).where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId))).limit(1);
    if (!student) throw new AppError("STUDENT_NOT_FOUND", "The student was not found.", 404);
    return mapStudent(student);
  });
}

export async function listStudents(workspaceId: string, input: ListStudentsInput) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const filters = [eq(students.workspaceId, workspaceId)];
    if (input.status) filters.push(eq(students.status, input.status));
    if (input.search) {
      const term = `%${input.search}%`;
      filters.push(or(ilike(students.fullName, term), ilike(students.studentCode, term), ilike(students.phone, term), ilike(students.guardianName, term), ilike(students.guardianPhone, term))!);
    }
    const where = and(...filters);
    const [rows, totalResult] = await Promise.all([
      transaction.select().from(students).where(where).orderBy(desc(students.createdAt), desc(students.id)).limit(input.limit).offset((input.page - 1) * input.limit),
      transaction.select({ total: count() }).from(students).where(where)
    ]);
    const total = Number(totalResult[0]?.total ?? 0);
    return { data: rows.map(mapStudent), meta: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) } };
  });
}

export async function updateStudent(workspaceId: string, studentId: string, input: UpdateStudentInput) {
  try {
    return await withWorkspaceContext(workspaceId, async (transaction) => {
      const [student] = await transaction
        .update(students)
        .set({ ...normalizeNullableFields(input), updatedAt: new Date() })
        .where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId)))
        .returning();
      if (!student) throw new AppError("STUDENT_NOT_FOUND", "The student was not found.", 404);
      return mapStudent(student);
    });
  } catch (error) {
    return asStudentError(error);
  }
}

export async function archiveStudent(workspaceId: string, actorUserId: string, studentId: string) {
  return withWorkspaceContext(workspaceId, async (transaction) => {
    const [student] = await transaction.update(students).set({ status: "archived", updatedAt: new Date() }).where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId))).returning();
    if (!student) throw new AppError("STUDENT_NOT_FOUND", "The student was not found.", 404);
    await recordAuditLog(transaction, { actorUserId, action: "student.archived", entityType: "student", entityId: student.id, workspaceId });
    return mapStudent(student);
  });
}
