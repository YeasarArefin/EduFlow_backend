import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, date } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { academicGroups, classLevels, mediums, studentTags } from "./academics";

export const studentStatus = pgEnum("student_status", ["active", "inactive", "archived"]);
export const studentGender = pgEnum("student_gender", ["male", "female", "other"]);

export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    studentCode: varchar("student_code", { length: 30 }).notNull(),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    institution: varchar("institution", { length: 200 }),
    classLevelId: uuid("class_level_id").references(() => classLevels.id),
    mediumId: uuid("medium_id").references(() => mediums.id),
    academicGroupId: uuid("academic_group_id").references(() => academicGroups.id),
    guardianName: varchar("guardian_name", { length: 150 }),
    guardianPhone: varchar("guardian_phone", { length: 30 }),
    address: text("address"),
    gender: studentGender("gender"),
    admissionDate: date("admission_date"),
    status: studentStatus("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("students_id_workspace_idx").on(table.id, table.workspaceId),
    uniqueIndex("students_workspace_code_idx").on(table.workspaceId, table.studentCode),
    index("students_workspace_status_idx").on(table.workspaceId, table.status),
    index("students_workspace_name_idx").on(table.workspaceId, table.fullName),
    index("students_workspace_phone_idx").on(table.workspaceId, table.phone),
    index("students_workspace_guardian_phone_idx").on(table.workspaceId, table.guardianPhone),
    index("students_class_level_idx").on(table.classLevelId),
    index("students_medium_idx").on(table.mediumId),
    index("students_academic_group_idx").on(table.academicGroupId)
  ]
);

export const studentTagAssignments = pgTable(
  "student_tag_assignments",
  {
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull().references(() => studentTags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("student_tag_assignments_student_tag_idx").on(table.studentId, table.tagId), index("student_tag_assignments_tag_idx").on(table.tagId)],
);
