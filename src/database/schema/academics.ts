import { boolean, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

function workspaceReferenceTable(name: "class_levels" | "mediums" | "academic_groups") {
  return pgTable(
    name,
    {
      id: uuid("id").defaultRandom().primaryKey(),
      workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
      name: varchar("name", { length: 80 }).notNull(),
      isActive: boolean("is_active").notNull().default(true),
    },
    (table) => [uniqueIndex(`${name}_workspace_name_idx`).on(table.workspaceId, table.name)],
  );
}

export const classLevels = workspaceReferenceTable("class_levels");
export const mediums = workspaceReferenceTable("mediums");
export const academicGroups = workspaceReferenceTable("academic_groups");

export const studentTags = pgTable(
  "student_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    name: varchar("name", { length: 60 }).notNull(),
  },
  (table) => [uniqueIndex("student_tags_workspace_name_idx").on(table.workspaceId, table.name)],
);
