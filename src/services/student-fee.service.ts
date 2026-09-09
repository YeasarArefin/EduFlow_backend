import { and, count, desc, eq, getTableColumns, ilike, or, sql, type SQL } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { batches, batchEnrollments } from '../database/schema/batches';
import { studentFees } from '../database/schema/fees';
import { students } from '../database/schema/students';
import { workspaceSettings } from '../database/schema/workspaces';
import { AppError } from '../middleware/error-handler';
import { recordAuditLog } from './audit-log.service';
import type { WorkspaceTransaction as Transaction } from '../types/common';
import type { StudentFee, StudentFeeQuery as FeeQuery } from '../types/student';

// PostgreSQL numeric arithmetic keeps money exact. Overdue is a date-sensitive
// projection, so reading or retrying a fee never needs to rewrite its snapshot.
function feeStatusExpression(expected: SQL, discount: SQL, paid: SQL, grace: SQL) {
  return sql<StudentFee['status']>`case
    when ${paid} > ${expected} - ${discount} then 'overpaid'
    when ${expected} = ${discount} then 'waived'
    when ${paid} = ${expected} - ${discount} then 'paid'
    when ${grace} < (current_timestamp at time zone 'Asia/Dhaka')::date then 'overdue'
    when ${paid} > 0 then 'partially_paid'
    else 'unpaid' end`;
}

const currentFeeStatus = feeStatusExpression(
  sql`${studentFees.expectedAmount}`,
  sql`${studentFees.discountAmount}`,
  sql`${studentFees.paidAmount}`,
  sql`${studentFees.graceDate}`
);
const feeSelection = { ...getTableColumns(studentFees), status: currentFeeStatus };

function mapFee(
  row: StudentFee,
  student?: { id: string; fullName: string; studentCode: string; phone: string | null } | null,
  batch?: { id: string; name: string } | null
) {
  return {
    id: row.id,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    feeMonth: row.feeMonth,
    expectedAmount: row.expectedAmount,
    discountAmount: row.discountAmount,
    paidAmount: row.paidAmount,
    dueAmount: row.dueAmount,
    status: row.status,
    dueDate: row.dueDate,
    graceDate: row.graceDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(student?.id
      ? {
          student: {
            id: student.id,
            fullName: student.fullName,
            studentCode: student.studentCode,
            phone: student.phone,
          },
        }
      : {}),
    ...(batch?.id ? { batch: { id: batch.id, name: batch.name } } : {}),
  };
}

async function insertEligibleFees(
  tx: Transaction,
  workspaceId: string,
  actorUserId: string,
  feeMonth: string,
  enrollmentId?: string
) {
  const [settings] = await tx
    .select({
      dueDay: workspaceSettings.defaultFeeDueDay,
      graceDays: workspaceSettings.gracePeriodDays,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId));
  const dueDay = settings?.dueDay ?? 31;
  const graceDays = settings?.graceDays ?? 0;
  if (dueDay < 1 || dueDay > 31 || graceDays < 0 || graceDays > 365) {
    throw new AppError(
      'FEE_SETTINGS_INVALID',
      'Fee due day must be 1–31 and grace period 0–365 days.',
      409
    );
  }

  const status = feeStatusExpression(
    sql`expected_amount`,
    sql`discount_amount`,
    sql`0::numeric`,
    sql`grace_date`
  );
  const result = await tx.execute<{ eligible: number; created: number }>(sql`
    with candidates as (
      select e.id as enrollment_id, e.student_id,
        coalesce(e.fee_override_minor, b.monthly_fee_minor)::numeric * 0.01 as expected_amount,
        least(coalesce(e.discount_minor, 0), coalesce(e.fee_override_minor, b.monthly_fee_minor))::numeric * 0.01 as discount_amount,
        ${feeMonth}::date + (least(${dueDay}::integer, extract(day from (${feeMonth}::date + interval '1 month - 1 day'))::integer) - 1) as due_date
      from batch_enrollments e
      join students s on s.id = e.student_id and s.workspace_id = ${workspaceId}::uuid
      join batches b on b.id = e.batch_id and b.workspace_id = ${workspaceId}::uuid
      where e.workspace_id = ${workspaceId}::uuid
        ${enrollmentId ? sql`and e.id = ${enrollmentId}::uuid` : sql``}
        and e.status = 'active' and s.status = 'active' and b.status = 'active'
        and e.enrolled_at < ${feeMonth}::date + interval '1 month'
        and (e.fee_start_month is null or e.fee_start_month < ${feeMonth}::date + interval '1 month')
        and (e.ended_at is null or e.ended_at >= ${feeMonth}::date)
        and (b.start_date is null or b.start_date < ${feeMonth}::date + interval '1 month')
        and (b.end_date is null or b.end_date >= ${feeMonth}::date)
    ), dated as (
      select *, due_date + ${graceDays}::integer as grace_date from candidates
    ), inserted as (
      insert into student_fees (workspace_id, student_id, enrollment_id, fee_month,
        expected_amount, discount_amount, paid_amount, status, due_date, grace_date)
      select ${workspaceId}::uuid, student_id, enrollment_id, ${feeMonth}::date,
        expected_amount, discount_amount, 0, (${status})::fee_status, due_date, grace_date
      from dated order by enrollment_id
      on conflict (enrollment_id, fee_month) do nothing
      returning id
    )
    select (select count(*)::integer from candidates) as eligible,
      (select count(*)::integer from inserted) as created
  `);
  const counts = result.rows[0];
  if (counts.created > 0) {
    await recordAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: 'fees.generated',
      entityType: 'student_fees',
      entityId: enrollmentId ?? workspaceId,
      metadata: { feeMonth, created: counts.created, eligible: counts.eligible },
    });
  }
  return { ...counts, existing: counts.eligible - counts.created };
}

export async function generateEnrollmentFee(
  workspaceId: string,
  actorUserId: string,
  enrollmentId: string,
  feeMonth: string
) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const where = and(
      eq(studentFees.workspaceId, workspaceId),
      eq(studentFees.enrollmentId, enrollmentId),
      eq(studentFees.feeMonth, feeMonth)
    );
    const [existing] = await tx.select(feeSelection).from(studentFees).where(where).limit(1);
    if (existing) return { fee: mapFee(existing), created: false };
    const [enrollment] = await tx
      .select({ id: batchEnrollments.id })
      .from(batchEnrollments)
      .where(
        and(eq(batchEnrollments.id, enrollmentId), eq(batchEnrollments.workspaceId, workspaceId))
      )
      .limit(1);
    if (!enrollment)
      throw new AppError('ENROLLMENT_NOT_FOUND', 'The enrollment was not found.', 404);
    const counts = await insertEligibleFees(tx, workspaceId, actorUserId, feeMonth, enrollmentId);
    const [fee] = await tx.select(feeSelection).from(studentFees).where(where).limit(1);
    if (!fee)
      throw new AppError(
        'ENROLLMENT_NOT_FEE_ELIGIBLE',
        'The enrollment is not eligible for fees in this month.',
        409
      );
    return { fee: mapFee(fee), created: counts.created > 0 };
  });
}

export async function bulkGenerateFees(workspaceId: string, actorUserId: string, feeMonth: string) {
  return withWorkspaceContext(workspaceId, async (tx) => ({
    feeMonth,
    ...(await insertEligibleFees(tx, workspaceId, actorUserId, feeMonth)),
  }));
}

export async function listStudentFees(workspaceId: string, query: FeeQuery, studentId?: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    if (studentId) {
      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId)))
        .limit(1);
      if (!student) throw new AppError('STUDENT_NOT_FOUND', 'The student was not found.', 404);
    }
    const where = and(
      eq(studentFees.workspaceId, workspaceId),
      studentId ? eq(studentFees.studentId, studentId) : undefined,
      query.feeMonth ? eq(studentFees.feeMonth, query.feeMonth) : undefined,
      query.status ? eq(currentFeeStatus, query.status) : undefined,
      query.search
        ? or(
            ilike(students.fullName, `%${query.search}%`),
            ilike(students.studentCode, `%${query.search}%`)
          )
        : undefined
    );

    const rows = await tx
      .select({
        fee: feeSelection,
        student: {
          id: students.id,
          fullName: students.fullName,
          studentCode: students.studentCode,
          phone: students.phone,
        },
        batch: {
          id: batches.id,
          name: batches.name,
        },
      })
      .from(studentFees)
      .leftJoin(
        students,
        and(eq(students.id, studentFees.studentId), eq(students.workspaceId, workspaceId))
      )
      .leftJoin(
        batchEnrollments,
        and(
          eq(batchEnrollments.id, studentFees.enrollmentId),
          eq(batchEnrollments.workspaceId, workspaceId)
        )
      )
      .leftJoin(
        batches,
        and(eq(batches.id, batchEnrollments.batchId), eq(batches.workspaceId, workspaceId))
      )
      .where(where)
      .orderBy(desc(studentFees.feeMonth), desc(studentFees.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const [totals] = await tx
      .select({ total: count() })
      .from(studentFees)
      .leftJoin(
        students,
        and(eq(students.id, studentFees.studentId), eq(students.workspaceId, workspaceId))
      )
      .where(where);

    let summary:
      | {
          totalExpected: string;
          totalCollected: string;
          totalOutstanding: string;
          totalOverdue: string;
        }
      | undefined;

    if (query.feeMonth) {
      const summaryRes = await tx.execute<{
        totalExpected: string;
        totalCollected: string;
        totalOutstanding: string;
        totalOverdue: string;
      }>(sql`
        select
          coalesce(sum(expected_amount - discount_amount), 0)::numeric(19,2)::text as "totalExpected",
          coalesce(sum(paid_amount), 0)::numeric(19,2)::text as "totalCollected",
          coalesce(sum(greatest(expected_amount - discount_amount - paid_amount, 0)), 0)::numeric(19,2)::text as "totalOutstanding",
          coalesce(sum(case when grace_date < (current_timestamp at time zone 'Asia/Dhaka')::date then greatest(expected_amount - discount_amount - paid_amount, 0) else 0 end), 0)::numeric(19,2)::text as "totalOverdue"
        from student_fees
        where workspace_id = ${workspaceId}::uuid
          and fee_month = ${query.feeMonth}::date
      `);
      summary = summaryRes.rows[0];
    }

    return {
      data: rows.map((r) => (studentId ? mapFee(r.fee) : mapFee(r.fee, r.student, r.batch))),
      meta: {
        page: query.page,
        limit: query.limit,
        total: totals.total,
        totalPages: Math.ceil(totals.total / query.limit),
        summary,
      },
    };
  });
}
