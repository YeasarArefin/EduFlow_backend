import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const platformOwners = pgTable(
  "platform_owners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Better Auth owns the referenced `user` table, introduced with authentication.
    userId: text("user_id").notNull().unique(),
    singletonKey: smallint("singleton_key").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("platform_owners_singleton_idx").on(table.singletonKey),
    check("platform_owners_singleton_chk", sql`${table.singletonKey} = 1`)
  ]
);

/** Append-only business activity record. Metadata is deliberately limited to safe, displayable summaries. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    actorUserId: text("actor_user_id"),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("audit_logs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_idx").on(table.createdAt)
  ]
);
