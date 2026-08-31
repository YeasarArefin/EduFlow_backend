import { index, integer, pgTable, primaryKey, smallint, text, varchar } from "drizzle-orm/pg-core";

export const workspaceRoles = pgTable("workspace_roles", {
  code: smallint("code").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  description: text("description")
});

export const permissions = pgTable("permissions", {
  code: integer("code").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  module: varchar("module", { length: 50 }),
  description: text("description")
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleCode: smallint("role_code")
      .notNull()
      .references(() => workspaceRoles.code),
    permissionCode: integer("permission_code")
      .notNull()
      .references(() => permissions.code)
  },
  (table) => [
    primaryKey({ columns: [table.roleCode, table.permissionCode] }),
    index("role_permissions_permission_idx").on(table.permissionCode)
  ]
);
