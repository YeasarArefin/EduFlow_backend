import { and, count, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { withWorkspaceContext } from "../database/client";
import { teacherSalaries } from "../database/schema/teacher-salaries";
import { teachers } from "../database/schema/teachers";
import { AppError } from "../middleware/error-handler";
import type { teacherSalaryListQuerySchema } from "../validation/teacher-salary.validation";
import { recordAuditLog } from "./audit-log.service";

type Transaction = Parameters<Parameters<typeof withWorkspaceContext>[1]>[0];
type Query = z.infer<typeof teacherSalaryListQuerySchema>;
type Salary = typeof teacherSalaries.$inferSelect;

function statusExpression(expected: SQL, adjustment: SQL, paid: SQL, month: SQL) {
  return sql<Salary["status"]>`case when ${expected} + ${adjustment} = 0 and ${paid} = 0 then 'waived'
    when ${paid} > 0 and ${paid} < ${expected} + ${adjustment} then 'partially_paid'
    when ${paid} = ${expected} + ${adjustment} then 'paid'
    when ${month} + interval '1 month' <= (current_timestamp at time zone 'Asia/Dhaka')::date then 'overdue'
    else 'pending' end`;
}
const currentStatus = statusExpression(sql`${teacherSalaries.expectedSalary}`, sql`${teacherSalaries.adjustmentAmount}`, sql`${teacherSalaries.paidAmount}`, sql`${teacherSalaries.salaryMonth}`);
const selection = { ...getTableColumns(teacherSalaries), status: currentStatus };
function map(row: Salary, teacher?: { id: string; name: string; teacherCode: string } | null) {
  return { id: row.id, teacherId: row.teacherId, salaryMonth: row.salaryMonth, expectedSalary: row.expectedSalary, adjustmentAmount: row.adjustmentAmount, paidAmount: row.paidAmount, dueAmount: row.dueAmount, status: row.status, paymentStartDate: row.paymentStartDate, createdAt: row.createdAt, updatedAt: row.updatedAt, ...(teacher ? { teacher } : {}) };
}

async function insertEligible(tx: Transaction, workspaceId: string, actorUserId: string, salaryMonth: string, teacherId?: string) {
  const status = statusExpression(sql`expected_salary`, sql`adjustment_amount`, sql`paid_amount`, sql`salary_month`);
  const result = await tx.execute<{ eligible: number; created: number }>(sql`
    with candidates as (
      select id as teacher_id, default_salary_minor::numeric * 0.01 as expected_salary
      from teachers where workspace_id = ${workspaceId}::uuid and status = 'active'
      ${teacherId ? sql`and id = ${teacherId}::uuid` : sql``}
    ), inserted as (
      insert into teacher_salaries (workspace_id, teacher_id, salary_month, expected_salary, adjustment_amount, paid_amount, status, payment_start_date)
      select ${workspaceId}::uuid, teacher_id, ${salaryMonth}::date, expected_salary, 0, 0,
        (${status})::teacher_salary_status, ${salaryMonth}::date
      from candidates order by teacher_id on conflict (teacher_id, salary_month) do nothing returning id
    ) select (select count(*)::integer from candidates) as eligible, (select count(*)::integer from inserted) as created`);
  const counts = result.rows[0];
  if (counts.created) await recordAuditLog(tx, { workspaceId, actorUserId, action: "teacher_salaries.generated", entityType: "teacher_salaries", entityId: teacherId ?? workspaceId, metadata: { salaryMonth, created: counts.created, eligible: counts.eligible } });
  return { ...counts, existing: counts.eligible - counts.created };
}

export async function generateTeacherSalary(workspaceId: string, actorUserId: string, teacherId: string, salaryMonth: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const where = and(eq(teacherSalaries.workspaceId, workspaceId), eq(teacherSalaries.teacherId, teacherId), eq(teacherSalaries.salaryMonth, salaryMonth));
    const [existing] = await tx.select(selection).from(teacherSalaries).where(where).limit(1);
    if (existing) return { salary: map(existing), created: false };
    const [teacher] = await tx.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.id, teacherId), eq(teachers.workspaceId, workspaceId))).limit(1);
    if (!teacher) throw new AppError("TEACHER_NOT_FOUND", "The teacher was not found.", 404);
    const counts = await insertEligible(tx, workspaceId, actorUserId, salaryMonth, teacherId);
    const [salary] = await tx.select(selection).from(teacherSalaries).where(where).limit(1);
    if (!salary) throw new AppError("TEACHER_NOT_SALARY_ELIGIBLE", "The teacher is not active for this salary month.", 409);
    return { salary: map(salary), created: counts.created > 0 };
  });
}

export async function bulkGenerateTeacherSalaries(workspaceId: string, actorUserId: string, salaryMonth: string) {
  return withWorkspaceContext(workspaceId, async (tx) => ({ salaryMonth, ...await insertEligible(tx, workspaceId, actorUserId, salaryMonth) }));
}

export async function listTeacherSalaries(workspaceId: string, query: Query, teacherId?: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    if (teacherId) { const [teacher] = await tx.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.id, teacherId), eq(teachers.workspaceId, workspaceId))).limit(1); if (!teacher) throw new AppError("TEACHER_NOT_FOUND", "The teacher was not found.", 404); }
    const where = and(eq(teacherSalaries.workspaceId, workspaceId), teacherId ? eq(teacherSalaries.teacherId, teacherId) : undefined, query.salaryMonth ? eq(teacherSalaries.salaryMonth, query.salaryMonth) : undefined, query.status ? eq(currentStatus, query.status) : undefined);
    const [rows, totals] = await Promise.all([
      tx.select({ salary: selection, teacher: { id: teachers.id, name: teachers.name, teacherCode: teachers.teacherCode } }).from(teacherSalaries).leftJoin(teachers, and(eq(teachers.id, teacherSalaries.teacherId), eq(teachers.workspaceId, workspaceId))).where(where).orderBy(desc(teacherSalaries.salaryMonth), desc(teacherSalaries.id)).limit(query.limit).offset((query.page - 1) * query.limit),
      tx.select({ total: count() }).from(teacherSalaries).where(where),
    ]);
    return { data: rows.map((row) => map(row.salary, teacherId ? undefined : row.teacher)), meta: { page: query.page, limit: query.limit, total: totals[0]?.total ?? 0, totalPages: Math.ceil((totals[0]?.total ?? 0) / query.limit) } };
  });
}
