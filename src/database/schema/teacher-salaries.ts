import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, numeric, pgEnum, pgPolicy, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { teacherSalaryStatuses } from "../../config/teacher-salaries";
import { teachers } from "./teachers";
import { workspaces } from "./workspaces";

export const teacherSalaryStatus = pgEnum("teacher_salary_status", teacherSalaryStatuses);
export const teacherSalaries = pgTable("teacher_salaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  teacherId: uuid("teacher_id").notNull(),
  salaryMonth: date("salary_month").notNull(),
  expectedSalary: numeric("expected_salary", { precision: 19, scale: 2 }).notNull(),
  adjustmentAmount: numeric("adjustment_amount", { precision: 19, scale: 2 }).notNull().default("0.00"),
  paidAmount: numeric("paid_amount", { precision: 19, scale: 2 }).notNull().default("0.00"),
  dueAmount: numeric("due_amount", { precision: 19, scale: 2 }).generatedAlwaysAs(sql`greatest(expected_salary + adjustment_amount - paid_amount, 0)`).notNull(),
  status: teacherSalaryStatus("status").notNull().default("pending"),
  paymentStartDate: date("payment_start_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("teacher_salaries_teacher_month_idx").on(table.teacherId, table.salaryMonth),
  index("teacher_salaries_workspace_month_status_idx").on(table.workspaceId, table.salaryMonth, table.status),
  index("teacher_salaries_teacher_workspace_month_idx").on(table.teacherId, table.workspaceId, table.salaryMonth),
  foreignKey({ name: "teacher_salaries_teacher_workspace_fk", columns: [table.teacherId, table.workspaceId], foreignColumns: [teachers.id, teachers.workspaceId] }),
  check("teacher_salaries_month_start_chk", sql`extract(day from ${table.salaryMonth}) = 1`),
  check("teacher_salaries_amounts_chk", sql`${table.expectedSalary} >= 0 and ${table.expectedSalary} < 'Infinity'::numeric and ${table.adjustmentAmount} >= -${table.expectedSalary} and ${table.adjustmentAmount} < 'Infinity'::numeric and ${table.paidAmount} >= 0 and ${table.paidAmount} < 'Infinity'::numeric`),
  check("teacher_salaries_payment_start_chk", sql`${table.paymentStartDate} >= ${table.salaryMonth}`),
  pgPolicy("teacher_salaries_workspace_isolation", { for: "all", to: "eduflow_app", using: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`, withCheck: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)` }),
]).enableRLS();
