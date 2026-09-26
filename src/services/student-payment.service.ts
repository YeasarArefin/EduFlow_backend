import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { studentFees, studentPayments } from '../database/schema/fees';
import { students } from '../database/schema/students';
import { workspaceSettings } from '../database/schema/workspaces';
import { AppError } from '../middleware/error-handler';
import { recordAuditLog } from './audit-log.service';
import { notifyPaymentRecorded } from './notification-channel.service';
import type { WorkspaceTransaction as Transaction } from '../types/common';
import type {
  RecordStudentPaymentInput as RecordPaymentInput,
  StudentPayment,
  StudentPaymentQuery as PaymentQuery,
} from '../types/student';

function mapPayment(row: StudentPayment) {
  return {
    id: row.id,
    studentId: row.studentId,
    studentFeeId: row.studentFeeId,
    amount: row.amount,
    paymentMethod: row.paymentMethod,
    paymentDate: row.paymentDate,
    receiptNumber: row.receiptNumber,
    note: row.note,
    recordedByUserId: row.recordedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function generateReceiptNumber(
  tx: Transaction,
  workspaceId: string,
  dateStr?: string
): Promise<string> {
  const [settings] = await tx
    .select({ prefix: workspaceSettings.receiptPrefix })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId));

  const prefix =
    settings?.prefix && settings.prefix.trim() ? settings.prefix.trim().toUpperCase() : 'RCP';

  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const ym = `${year}${month}`;
  const searchPrefix = `${prefix}-${ym}-%`;

  const countResult = await tx.execute<{ count: number }>(sql`
    select count(*)::integer as count
    from student_payments
    where workspace_id = ${workspaceId}::uuid
      and receipt_number like ${searchPrefix}
  `);

  const baseSeq = (countResult.rows[0]?.count ?? 0) + 1;
  let attempt = 0;
  let receiptNumber = `${prefix}-${ym}-${String(baseSeq).padStart(4, '0')}`;

  while (true) {
    const [existing] = await tx
      .select({ id: studentPayments.id })
      .from(studentPayments)
      .where(
        and(
          eq(studentPayments.workspaceId, workspaceId),
          eq(studentPayments.receiptNumber, receiptNumber)
        )
      )
      .limit(1);

    if (!existing) break;
    attempt++;
    receiptNumber = `${prefix}-${ym}-${String(baseSeq + attempt).padStart(4, '0')}`;
  }

  return receiptNumber;
}

export async function recordStudentPayment(
  workspaceId: string,
  actorUserId: string,
  feeId: string,
  input: RecordPaymentInput
) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    // Lock the student_fee record for update
    const [fee] = await tx
      .select()
      .from(studentFees)
      .where(and(eq(studentFees.id, feeId), eq(studentFees.workspaceId, workspaceId)))
      .for('update')
      .limit(1);

    if (!fee) {
      throw new AppError('FEE_NOT_FOUND', 'The fee record was not found.', 404);
    }

    const [student] = await tx
      .select({ id: students.id, fullName: students.fullName, studentCode: students.studentCode })
      .from(students)
      .where(and(eq(students.id, fee.studentId), eq(students.workspaceId, workspaceId)))
      .limit(1);

    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'The student was not found.', 404);
    }

    // Evaluate exact financial balances in PostgreSQL
    const calcResult = await tx.execute<{
      netPayable: string;
      currentPaid: string;
      currentDue: string;
      newPaid: string;
      isWaived: boolean;
      isFullyPaid: boolean;
      isExcess: boolean;
      completesFee: boolean;
    }>(sql`
      select
        (expected_amount - discount_amount)::numeric(19,2)::text as "netPayable",
        paid_amount::numeric(19,2)::text as "currentPaid",
        greatest(expected_amount - discount_amount - paid_amount, 0)::numeric(19,2)::text as "currentDue",
        (paid_amount + ${input.amount}::numeric(19,2))::numeric(19,2)::text as "newPaid",
        (expected_amount = discount_amount) as "isWaived",
        (paid_amount >= (expected_amount - discount_amount) and (expected_amount > discount_amount)) as "isFullyPaid",
        (${input.amount}::numeric(19,2) > greatest(expected_amount - discount_amount - paid_amount, 0)) as "isExcess",
        ((paid_amount + ${input.amount}::numeric(19,2)) = (expected_amount - discount_amount)) as "completesFee"
      from student_fees
      where id = ${feeId}::uuid and workspace_id = ${workspaceId}::uuid
    `);

    const calc = calcResult.rows[0];
    if (!calc) {
      throw new AppError('FEE_NOT_FOUND', 'The fee record was not found.', 404);
    }

    if (calc.isWaived || fee.status === 'waived') {
      throw new AppError(
        'FEE_ALREADY_WAIVED',
        'This fee has been fully waived and requires no payment.',
        409
      );
    }

    if (calc.isFullyPaid || fee.status === 'paid') {
      throw new AppError('FEE_ALREADY_PAID', 'This fee is already fully paid.', 409);
    }

    if (calc.isExcess) {
      throw new AppError(
        'EXCESS_PAYMENT_NOT_ALLOWED',
        `Payment amount (${input.amount}) exceeds the remaining fee due balance of ৳${calc.currentDue}.`,
        409
      );
    }

    // Determine or validate receipt number
    let receiptNumber: string;
    if (input.receiptNumber && input.receiptNumber.trim()) {
      receiptNumber = input.receiptNumber.trim();
      const [existing] = await tx
        .select({ id: studentPayments.id })
        .from(studentPayments)
        .where(
          and(
            eq(studentPayments.workspaceId, workspaceId),
            eq(studentPayments.receiptNumber, receiptNumber)
          )
        )
        .limit(1);

      if (existing) {
        throw new AppError(
          'DUPLICATE_RECEIPT_NUMBER',
          `A receipt with number "${receiptNumber}" already exists in this workspace.`,
          409
        );
      }
    } else {
      receiptNumber = await generateReceiptNumber(tx, workspaceId, input.paymentDate);
    }

    const newStatus = calc.completesFee ? ('paid' as const) : ('partially_paid' as const);

    // Insert payment record
    const [payment] = await tx
      .insert(studentPayments)
      .values({
        workspaceId,
        studentId: fee.studentId,
        studentFeeId: fee.id,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate ? input.paymentDate : sql`current_date`,
        receiptNumber,
        note: input.note ?? null,
        recordedByUserId: actorUserId,
      })
      .returning();

    // Update fee record balance and status
    await tx
      .update(studentFees)
      .set({
        paidAmount: calc.newPaid,
        status: newStatus,
        updatedAt: sql`now()`,
      })
      .where(and(eq(studentFees.id, fee.id), eq(studentFees.workspaceId, workspaceId)));

    // Record audit log
    await recordAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: 'fees.payment_recorded',
      entityType: 'student_payments',
      entityId: payment.id,
      metadata: {
        feeId: fee.id,
        studentId: fee.studentId,
        amount: input.amount,
        receiptNumber,
        paymentMethod: input.paymentMethod,
        newPaidAmount: calc.newPaid,
        newStatus,
      },
    });

    const response = {
      payment: mapPayment(payment),
      fee: {
        id: fee.id,
        feeMonth: fee.feeMonth,
        expectedAmount: fee.expectedAmount,
        discountAmount: fee.discountAmount,
        paidAmount: calc.newPaid,
        dueAmount: calc.completesFee
          ? '0.00'
          : (Number(calc.currentDue) - Number(input.amount)).toFixed(2),
        status: newStatus,
      },
      student: {
        id: student.id,
        fullName: student.fullName,
        studentCode: student.studentCode,
      },
    };
    void notifyPaymentRecorded(workspaceId, payment.id).catch(() => undefined);
    return response;
  });
}

export async function listFeePayments(workspaceId: string, feeId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [fee] = await tx
      .select({ id: studentFees.id, studentId: studentFees.studentId })
      .from(studentFees)
      .where(and(eq(studentFees.id, feeId), eq(studentFees.workspaceId, workspaceId)))
      .limit(1);

    if (!fee) {
      throw new AppError('FEE_NOT_FOUND', 'The fee record was not found.', 404);
    }

    const rows = await tx
      .select()
      .from(studentPayments)
      .where(
        and(eq(studentPayments.workspaceId, workspaceId), eq(studentPayments.studentFeeId, feeId))
      )
      .orderBy(
        desc(studentPayments.paymentDate),
        desc(studentPayments.createdAt),
        desc(studentPayments.id)
      );

    return {
      data: rows.map(mapPayment),
    };
  });
}

export async function listStudentPaymentHistory(
  workspaceId: string,
  studentId: string,
  query: PaymentQuery
) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId)))
      .limit(1);

    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'The student was not found.', 404);
    }

    const where = and(
      eq(studentPayments.workspaceId, workspaceId),
      eq(studentPayments.studentId, studentId),
      query.startDate ? gte(studentPayments.paymentDate, query.startDate) : undefined,
      query.endDate ? lte(studentPayments.paymentDate, query.endDate) : undefined,
      query.paymentMethod ? eq(studentPayments.paymentMethod, query.paymentMethod) : undefined
    );

    const rows = await tx
      .select()
      .from(studentPayments)
      .where(where)
      .orderBy(
        desc(studentPayments.paymentDate),
        desc(studentPayments.createdAt),
        desc(studentPayments.id)
      )
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const [totals] = await tx.select({ total: count() }).from(studentPayments).where(where);

    return {
      data: rows.map(mapPayment),
      meta: {
        page: query.page,
        limit: query.limit,
        total: totals.total,
        totalPages: Math.ceil(totals.total / query.limit),
      },
    };
  });
}

export async function getPaymentById(workspaceId: string, paymentId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [payment] = await tx
      .select()
      .from(studentPayments)
      .where(and(eq(studentPayments.workspaceId, workspaceId), eq(studentPayments.id, paymentId)))
      .limit(1);

    if (!payment) {
      throw new AppError('PAYMENT_NOT_FOUND', 'The payment record was not found.', 404);
    }

    const [fee] = await tx
      .select()
      .from(studentFees)
      .where(
        and(eq(studentFees.id, payment.studentFeeId), eq(studentFees.workspaceId, workspaceId))
      )
      .limit(1);

    const [student] = await tx
      .select({ id: students.id, fullName: students.fullName, studentCode: students.studentCode })
      .from(students)
      .where(and(eq(students.id, payment.studentId), eq(students.workspaceId, workspaceId)))
      .limit(1);

    return {
      data: {
        ...mapPayment(payment),
        fee: fee
          ? {
              id: fee.id,
              feeMonth: fee.feeMonth,
              expectedAmount: fee.expectedAmount,
              discountAmount: fee.discountAmount,
              paidAmount: fee.paidAmount,
              dueAmount: fee.dueAmount,
              status: fee.status,
            }
          : null,
        student: student ?? null,
      },
    };
  });
}

export async function getPaymentByReceiptNumber(workspaceId: string, receiptNumber: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [payment] = await tx
      .select()
      .from(studentPayments)
      .where(
        and(
          eq(studentPayments.workspaceId, workspaceId),
          eq(studentPayments.receiptNumber, receiptNumber)
        )
      )
      .limit(1);

    if (!payment) {
      throw new AppError('RECEIPT_NOT_FOUND', 'The receipt was not found.', 404);
    }

    const [fee] = await tx
      .select()
      .from(studentFees)
      .where(
        and(eq(studentFees.id, payment.studentFeeId), eq(studentFees.workspaceId, workspaceId))
      )
      .limit(1);

    const [student] = await tx
      .select({ id: students.id, fullName: students.fullName, studentCode: students.studentCode })
      .from(students)
      .where(and(eq(students.id, payment.studentId), eq(students.workspaceId, workspaceId)))
      .limit(1);

    return {
      data: {
        ...mapPayment(payment),
        fee: fee
          ? {
              id: fee.id,
              feeMonth: fee.feeMonth,
              expectedAmount: fee.expectedAmount,
              discountAmount: fee.discountAmount,
              paidAmount: fee.paidAmount,
              dueAmount: fee.dueAmount,
              status: fee.status,
            }
          : null,
        student: student ?? null,
      },
    };
  });
}
