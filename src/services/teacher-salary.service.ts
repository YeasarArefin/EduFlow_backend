import { and, count, desc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { teacherSalaries } from '../database/schema/teacher-salaries';
import { teachers } from '../database/schema/teachers';
import { AppError } from '../middleware/error-handler';
import { recordAuditLog } from './audit-log.service';
import type { WorkspaceTransaction as Transaction } from '../types/common';
import type { RecordTeacherSalaryPaymentInput as RecordPaymentInput, TeacherSalary as Salary, TeacherSalaryQuery as Query } from '../types/teacher';

function statusExpression(expected: SQL, adjustment: SQL, paid: SQL, month: SQL) {
  return sql<
    Salary['status']
  >`case when ${expected} + ${adjustment} = 0 and ${paid} = 0 then 'waived'
    when ${paid} > 0 and ${paid} < ${expected} + ${adjustment} then 'partially_paid'
    when ${paid} = ${expected} + ${adjustment} then 'paid'
    when ${month} + interval '1 month' <= (current_timestamp at time zone 'Asia/Dhaka')::date then 'overdue'
    else 'pending' end`;
}
const currentStatus = statusExpression(
  sql`${teacherSalaries.expectedSalary}`,
  sql`${teacherSalaries.adjustmentAmount}`,
  sql`${teacherSalaries.paidAmount}`,
  sql`${teacherSalaries.salaryMonth}`
);
const selection = { ...getTableColumns(teacherSalaries), status: currentStatus };
function map(row: Salary, teacher?: { id: string; name: string; teacherCode: string } | null) {
  return {
    id: row.id,
    teacherId: row.teacherId,
    salaryMonth: row.salaryMonth,
    expectedSalary: row.expectedSalary,
    adjustmentAmount: row.adjustmentAmount,
    paidAmount: row.paidAmount,
    dueAmount: row.dueAmount,
    status: row.status,
    paymentStartDate: row.paymentStartDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(teacher ? { teacher } : {}),
  };
}

async function insertEligible(
  tx: Transaction,
  workspaceId: string,
  actorUserId: string,
  salaryMonth: string,
  teacherId?: string
) {
  const result = await tx.execute<{ eligible: number; created: number }>(sql`
    with candidates as (
      select id as teacher_id, default_salary_minor::numeric * 0.01 as expected_salary
      from teachers where workspace_id = ${workspaceId}::uuid and status = 'active'
      ${teacherId ? sql`and id = ${teacherId}::uuid` : sql``}
    ), inserted as (
      insert into teacher_salaries (workspace_id, teacher_id, salary_month, expected_salary, adjustment_amount, paid_amount, status, payment_start_date)
      select ${workspaceId}::uuid, teacher_id, ${salaryMonth}::date, expected_salary, 0, 0,
        (case when expected_salary = 0 then 'waived' else 'pending' end)::teacher_salary_status, ${salaryMonth}::date
      from candidates order by teacher_id on conflict (teacher_id, salary_month) do nothing returning id
    ) select (select count(*)::integer from candidates) as eligible, (select count(*)::integer from inserted) as created`);
  const counts = result.rows[0];
  if (counts.created)
    await recordAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: 'teacher_salaries.generated',
      entityType: 'teacher_salaries',
      entityId: teacherId ?? workspaceId,
      metadata: { salaryMonth, created: counts.created, eligible: counts.eligible },
    });
  return { ...counts, existing: counts.eligible - counts.created };
}

export async function generateTeacherSalary(
  workspaceId: string,
  actorUserId: string,
  teacherId: string,
  salaryMonth: string
) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const where = and(
      eq(teacherSalaries.workspaceId, workspaceId),
      eq(teacherSalaries.teacherId, teacherId),
      eq(teacherSalaries.salaryMonth, salaryMonth)
    );
    const [existing] = await tx.select(selection).from(teacherSalaries).where(where).limit(1);
    if (existing) return { salary: map(existing), created: false };
    const [teacher] = await tx
      .select({ id: teachers.id })
      .from(teachers)
      .where(and(eq(teachers.id, teacherId), eq(teachers.workspaceId, workspaceId)))
      .limit(1);
    if (!teacher) throw new AppError('TEACHER_NOT_FOUND', 'The teacher was not found.', 404);
    const counts = await insertEligible(tx, workspaceId, actorUserId, salaryMonth, teacherId);
    const [salary] = await tx.select(selection).from(teacherSalaries).where(where).limit(1);
    if (!salary)
      throw new AppError(
        'TEACHER_NOT_SALARY_ELIGIBLE',
        'The teacher is not active for this salary month.',
        409
      );
    return { salary: map(salary), created: counts.created > 0 };
  });
}

export async function bulkGenerateTeacherSalaries(
  workspaceId: string,
  actorUserId: string,
  salaryMonth: string
) {
  return withWorkspaceContext(workspaceId, async (tx) => ({
    salaryMonth,
    ...(await insertEligible(tx, workspaceId, actorUserId, salaryMonth)),
  }));
}

export async function listTeacherSalaries(workspaceId: string, query: Query, teacherId?: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    if (teacherId) {
      const [teacher] = await tx
        .select({ id: teachers.id })
        .from(teachers)
        .where(and(eq(teachers.id, teacherId), eq(teachers.workspaceId, workspaceId)))
        .limit(1);
      if (!teacher) throw new AppError('TEACHER_NOT_FOUND', 'The teacher was not found.', 404);
    }
    const where = and(
      eq(teacherSalaries.workspaceId, workspaceId),
      teacherId ? eq(teacherSalaries.teacherId, teacherId) : undefined,
      query.salaryMonth ? eq(teacherSalaries.salaryMonth, query.salaryMonth) : undefined,
      query.status ? eq(currentStatus, query.status) : undefined
    );
    const [rows, totals] = await Promise.all([
      tx
        .select({
          salary: selection,
          teacher: { id: teachers.id, name: teachers.name, teacherCode: teachers.teacherCode },
        })
        .from(teacherSalaries)
        .leftJoin(
          teachers,
          and(eq(teachers.id, teacherSalaries.teacherId), eq(teachers.workspaceId, workspaceId))
        )
        .where(where)
        .orderBy(desc(teacherSalaries.salaryMonth), desc(teacherSalaries.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      tx.select({ total: count() }).from(teacherSalaries).where(where),
    ]);
    return {
      data: rows.map((row) => map(row.salary, teacherId ? undefined : row.teacher)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: totals[0]?.total ?? 0,
        totalPages: Math.ceil((totals[0]?.total ?? 0) / query.limit),
      },
    };
  });
}

export async function listTeacherSalaryPayments(workspaceId: string, salaryId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [salary] = await tx
      .select({ id: teacherSalaries.id })
      .from(teacherSalaries)
      .where(and(eq(teacherSalaries.id, salaryId), eq(teacherSalaries.workspaceId, workspaceId)))
      .limit(1);
    if (!salary)
      throw new AppError(
        'TEACHER_SALARY_NOT_FOUND',
        'The teacher salary record was not found.',
        404
      );

    const payments = await tx.execute<{
      id: string;
      amount: string;
      paymentMethod: string;
      paymentDate: string;
      note: string | null;
      createdAt: Date;
    }>(sql`select id, amount::text as amount, payment_method as "paymentMethod",
      payment_date as "paymentDate", note, created_at as "createdAt"
      from teacher_salary_payments
      where workspace_id = ${workspaceId}::uuid and teacher_salary_id = ${salaryId}::uuid
      order by payment_date desc, created_at desc, id desc`);
    return payments.rows;
  });
}

export async function recordTeacherSalaryPayment(
  workspaceId: string,
  actorUserId: string,
  salaryId: string,
  input: RecordPaymentInput
) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const result = await tx.execute<{
      id: string;
      expectedSalary: string;
      adjustmentAmount: string;
      paidAmount: string;
      currentDue: string;
      newPaid: string;
      newDue: string;
      isExcess: boolean;
    }>(sql`select id, expected_salary::text as "expectedSalary",
      adjustment_amount::text as "adjustmentAmount", paid_amount::text as "paidAmount",
      greatest(expected_salary + adjustment_amount - paid_amount, 0)::numeric(19,2)::text as "currentDue",
      (paid_amount + ${input.amount}::numeric(19,2))::numeric(19,2)::text as "newPaid",
      greatest(expected_salary + adjustment_amount - paid_amount - ${input.amount}::numeric(19,2), 0)::numeric(19,2)::text as "newDue",
      (${input.amount}::numeric(19,2) > greatest(expected_salary + adjustment_amount - paid_amount, 0)) as "isExcess"
      from teacher_salaries
      where id = ${salaryId}::uuid and workspace_id = ${workspaceId}::uuid
      for update`);
    const salary = result.rows[0];
    if (!salary)
      throw new AppError(
        'TEACHER_SALARY_NOT_FOUND',
        'The teacher salary record was not found.',
        404
      );
    if (Number(salary.currentDue) <= 0) {
      throw new AppError(
        'TEACHER_SALARY_ALREADY_SETTLED',
        'This teacher salary has no remaining balance.',
        409
      );
    }
    if (salary.isExcess) {
      throw new AppError(
        'EXCESS_SALARY_PAYMENT_NOT_ALLOWED',
        `Payment amount (${input.amount}) exceeds the remaining salary balance of ৳${salary.currentDue}.`,
        409
      );
    }

    const newStatus = Number(salary.newDue) === 0 ? 'paid' : 'partially_paid';
    const paymentResult = await tx.execute<{
      id: string;
      amount: string;
      paymentMethod: string;
      paymentDate: string;
      note: string | null;
      createdAt: Date;
    }>(sql`insert into teacher_salary_payments
      (workspace_id, teacher_salary_id, amount, payment_method, payment_date, note, recorded_by_user_id)
      values (${workspaceId}::uuid, ${salaryId}::uuid, ${input.amount}::numeric(19,2),
        ${input.paymentMethod}::teacher_salary_payment_method, coalesce(${input.paymentDate ?? null}::date, current_date),
        ${input.note ?? null}, ${actorUserId})
      returning id, amount::text as amount, payment_method as "paymentMethod",
        payment_date as "paymentDate", note, created_at as "createdAt"`);
    const payment = paymentResult.rows[0];

    await tx
      .update(teacherSalaries)
      .set({
        paidAmount: salary.newPaid,
        status: newStatus,
        updatedAt: sql`now()`,
      })
      .where(and(eq(teacherSalaries.id, salaryId), eq(teacherSalaries.workspaceId, workspaceId)));

    await recordAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: 'teacher_salaries.payment_recorded',
      entityType: 'teacher_salary_payments',
      entityId: payment.id,
      metadata: { salaryId, amount: input.amount, paymentMethod: input.paymentMethod, newStatus },
    });

    return {
      payment,
      salary: {
        id: salary.id,
        paidAmount: salary.newPaid,
        dueAmount: salary.newDue,
        status: newStatus,
      },
    };
  });
}
