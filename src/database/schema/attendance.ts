import { sql } from "drizzle-orm";
import { date, foreignKey, index, pgEnum, pgPolicy, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { attendanceRecordStatuses, attendanceSessionStatuses } from "../../config/attendance";
import { batches } from "./batches";
import { students } from "./students";
import { workspaces } from "./workspaces";

export const attendanceSessionStatus = pgEnum("attendance_session_status", attendanceSessionStatuses);
export const attendanceStatus = pgEnum("attendance_status", attendanceRecordStatuses);

export const attendanceSessions = pgTable("attendance_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  batchId: uuid("batch_id").notNull(),
  sessionDate: date("session_date").notNull(),
  status: attendanceSessionStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("attendance_sessions_batch_date_idx").on(table.batchId, table.sessionDate),
  uniqueIndex("attendance_sessions_id_workspace_idx").on(table.id, table.workspaceId),
  index("attendance_sessions_workspace_date_idx").on(table.workspaceId, table.sessionDate),
  foreignKey({
    name: "attendance_sessions_batch_workspace_fk",
    columns: [table.batchId, table.workspaceId],
    foreignColumns: [batches.id, batches.workspaceId],
  }),
  pgPolicy("attendance_sessions_workspace_isolation", {
    for: "all", to: "eduflow_app",
    using: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
    withCheck: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
  }),
]).enableRLS();

export const attendanceRecords = pgTable("attendance_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  attendanceSessionId: uuid("attendance_session_id").notNull(),
  studentId: uuid("student_id").notNull(),
  status: attendanceStatus("status").notNull().default("absent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("attendance_records_session_student_idx").on(table.attendanceSessionId, table.studentId),
  index("attendance_records_workspace_session_idx").on(table.workspaceId, table.attendanceSessionId),
  index("attendance_records_student_workspace_idx").on(table.studentId, table.workspaceId),
  foreignKey({
    name: "attendance_records_session_workspace_fk",
    columns: [table.attendanceSessionId, table.workspaceId],
    foreignColumns: [attendanceSessions.id, attendanceSessions.workspaceId],
  }),
  foreignKey({
    name: "attendance_records_student_workspace_fk",
    columns: [table.studentId, table.workspaceId],
    foreignColumns: [students.id, students.workspaceId],
  }),
  pgPolicy("attendance_records_workspace_isolation", {
    for: "all", to: "eduflow_app",
    using: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
    withCheck: sql`${table.workspaceId} = (select nullif(current_setting('app.workspace_id', true), '')::uuid)`,
  }),
]).enableRLS();
