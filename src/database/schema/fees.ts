import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, numeric, pgEnum, pgPolicy, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { studentFeeStatuses } from "../../config/student-fees";
import { batchEnrollments } from "./batches";
import { students } from "./students";
import { workspaces } from "./workspaces";

export const feeStatus = pgEnum("fee_status", studentFeeStatuses);

export const studentFees = pgTable("student_fees", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  studentId: uuid("student_id").notNull(),
  enrollmentId: uuid("enrollment_id").notNull(),
  feeMonth: date("fee_month").notNull(),
  expectedAmount: numeric("expected_amount", { precision: 19, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 19, scale: 2 }).notNull().default("0.00"),
  paidAmount: numeric("paid_amount", { precision: 19, scale: 2 }).notNull().default("0.00"),
  dueAmount: numeric("due_amount", { precision: 19, scale: 2 }).generatedAlwaysAs(
    sql`greatest(expected_amount - discount_amount - paid_amount, 0)`,
  ).notNull(),
  status: feeStatus("status").notNull().default("unpaid"),
  dueDate: date("due_date").notNull(),
  graceDate: date("grace_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("student_fees_enrollment_month_idx").on(table.enrollmentId, table.feeMonth),
  index("student_fees_workspace_month_status_idx").on(table.workspaceId, table.feeMonth, table.status),
  index("student_fees_student_workspace_month_idx").on(table.studentId, table.workspaceId, table.feeMonth),
  foreignKey({ name: "student_fees_enrollment_workspace_student_fk", columns: [table.enrollmentId, table.workspaceId, table.studentId], foreignColumns: [batchEnrollments.id, batchEnrollments.workspaceId, batchEnrollments.studentId] }),
  foreignKey({ name: "student_fees_student_workspace_fk", columns: [table.studentId, table.workspaceId], foreignColumns: [students.id, students.workspaceId] }),
  check("student_fees_month_start_chk", sql`extract(day from ${table.feeMonth}) = 1`),
  check("student_fees_amounts_chk", sql`${table.expectedAmount} >= 0 and ${table.expectedAmount} < 'Infinity'::numeric and ${table.discountAmount} >= 0 and ${table.discountAmount} <= ${table.expectedAmount} and ${table.paidAmount} >= 0 and ${table.paidAmount} < 'Infinity'::numeric`),
  check("student_fees_dates_chk", sql`${table.dueDate} >= ${table.feeMonth} and ${table.graceDate} >= ${table.dueDate}`),
  check("student_fees_status_amounts_chk", sql`
    (${table.status} = 'waived' and ${table.expectedAmount} = ${table.discountAmount} and ${table.paidAmount} = 0) or
    (${table.status} = 'paid' and ${table.expectedAmount} > ${table.discountAmount} and ${table.paidAmount} = ${table.expectedAmount} - ${table.discountAmount}) or
    (${table.status} = 'overpaid' and ${table.paidAmount} > ${table.expectedAmount} - ${table.discountAmount}) or
    (${table.status} = 'unpaid' and ${table.dueAmount} > 0 and ${table.paidAmount} = 0) or
    (${table.status} = 'partially_paid' and ${table.dueAmount} > 0 and ${table.paidAmount} > 0) or
    (${table.status} = 'overdue' and ${table.dueAmount} > 0)
  `),
  pgPolicy("student_fees_workspace_isolation", {
    for: "all", to: "eduflow_app",
    using: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
    withCheck: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
  }),
]).enableRLS();
