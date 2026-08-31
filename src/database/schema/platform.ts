import { sql } from "drizzle-orm";
import { check, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const platformOwners = pgTable(
  "platform_owners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Better Auth owns the referenced `user` table, introduced with authentication.
    userId: text("user_id").notNull().unique(),
    singletonKey: smallint("singleton_key").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("platform_owners_singleton_idx").on(table.singletonKey),
    check("platform_owners_singleton_chk", sql`${table.singletonKey} = 1`),
  ],
);
