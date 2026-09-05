import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { academicGroups, classLevels, mediums } from "./academics";
import { students } from "./students";
import { teachers } from "./teachers";
import { workspaces } from "./workspaces";

export const batchStatus = pgEnum("batch_status", ["active", "inactive", "archived"]);
export const enrollmentStatus = pgEnum("enrollment_status", ["active", "inactive", "completed", "cancelled", "archived"]);

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    name: varchar("name", { length: 150 }).notNull(),
    classLevelId: uuid("class_level_id").notNull().references(() => classLevels.id),
    mediumId: uuid("medium_id").references(() => mediums.id),
    academicGroupId: uuid("academic_group_id").references(() => academicGroups.id),
    monthlyFeeMinor: bigint("monthly_fee_minor", { mode: "bigint" }).notNull().default(sql`0`),
    status: batchStatus("status").notNull().default("active"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    maxCapacity: integer("max_capacity"),
    room: varchar("room", { length: 100 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("batches_workspace_name_idx").on(table.workspaceId, table.name),
    index("batches_workspace_status_idx").on(table.workspaceId, table.status),
    index("batches_class_level_idx").on(table.classLevelId),
    index("batches_medium_idx").on(table.mediumId),
    index("batches_academic_group_idx").on(table.academicGroupId),
    check("batches_monthly_fee_minor_nonnegative_chk", sql`${table.monthlyFeeMinor} >= 0`),
  ],
);


export const batchEnrollments = pgTable(
  "batch_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    status: enrollmentStatus("status").notNull().default("active"),
    enrolledAt: date("enrolled_at").notNull().default(sql`CURRENT_DATE`),
    endedAt: date("ended_at"),
    feeStartMonth: date("fee_start_month"),
    feeOverrideMinor: bigint("fee_override_minor", { mode: "bigint" }),
    discountMinor: bigint("discount_minor", { mode: "bigint" }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("batch_enrollments_workspace_student_idx").on(table.workspaceId, table.studentId),
    index("batch_enrollments_workspace_batch_idx").on(table.workspaceId, table.batchId),
    uniqueIndex("batch_enrollments_one_active_idx").on(table.studentId, table.batchId).where(sql`${table.status} = 'active'`),
    check("batch_enrollments_fee_override_nonnegative_chk", sql`${table.feeOverrideMinor} IS NULL OR ${table.feeOverrideMinor} >= 0`),
    check("batch_enrollments_discount_nonnegative_chk", sql`${table.discountMinor} IS NULL OR ${table.discountMinor} >= 0`),
  ],
);

export const batchTeachers = pgTable(
  "batch_teachers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("batch_teachers_batch_teacher_idx").on(table.batchId, table.teacherId),
    uniqueIndex("batch_teachers_one_primary_idx").on(table.batchId).where(sql`${table.isPrimary}`),
    index("batch_teachers_workspace_batch_idx").on(table.workspaceId, table.batchId),
    index("batch_teachers_teacher_idx").on(table.teacherId),
  ],
);
