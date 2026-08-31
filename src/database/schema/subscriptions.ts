import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { platformOwners } from "./platform";

export const subscriptionStatus = pgEnum("subscription_status", [
  "trial",
  "pending",
  "active",
  "renewal_due",
  "expired",
  "cancelled",
  "suspended",
]);

export const paymentRequestStatus = pgEnum("payment_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const paymentRequestPurpose = pgEnum("payment_request_purpose", [
  "subscription",
  "sms_credit",
]);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "bkash",
  "nagad",
  "rocket",
  "other",
]);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    priceMinor: bigint("price_minor", { mode: "bigint" }).notNull().default(sql`0`),
    durationDays: integer("duration_days").notNull(),
    trialDays: integer("trial_days").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("plans_active_idx").on(table.isActive),
    check("plans_price_minor_nonnegative_chk", sql`${table.priceMinor} >= 0`),
    check("plans_duration_days_nonnegative_chk", sql`${table.durationDays} >= 0`),
    check("plans_trial_days_nonnegative_chk", sql`${table.trialDays} >= 0`),
  ],
);

export const features = pgTable("features", {
  key: varchar("key", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
});

export const planFeatures = pgTable(
  "plan_features",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    featureKey: varchar("feature_key", { length: 100 })
      .notNull()
      .references(() => features.key),
    enabled: boolean("enabled").notNull().default(false),
    limitValue: bigint("limit_value", { mode: "bigint" }),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.featureKey] }),
    index("plan_features_feature_idx").on(table.featureKey),
    check("plan_features_limit_nonnegative_chk", sql`${table.limitValue} is null or ${table.limitValue} >= 0`),
  ],
);

export const workspaceEntitlementOverrides = pgTable(
  "workspace_entitlement_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    featureKey: varchar("feature_key", { length: 100 })
      .notNull()
      .references(() => features.key),
    enabledOverride: boolean("enabled_override"),
    limitOverride: bigint("limit_override", { mode: "bigint" }),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_entitlement_overrides_workspace_feature_idx").on(table.workspaceId, table.featureKey),
    index("workspace_entitlement_overrides_expires_idx").on(table.expiresAt),
    check("workspace_entitlement_overrides_limit_nonnegative_chk", sql`${table.limitOverride} is null or ${table.limitOverride} >= 0`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus("status").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    renewalDueAt: timestamp("renewal_due_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("subscriptions_workspace_status_idx").on(table.workspaceId, table.status),
    uniqueIndex("subscriptions_one_current_per_workspace_idx")
      .on(table.workspaceId)
      .where(sql`${table.status} in ('trial', 'pending', 'active', 'renewal_due')`),
    index("subscriptions_expires_idx").on(table.expiresAt),
    index("subscriptions_renewal_due_idx").on(table.renewalDueAt),
    index("subscriptions_plan_idx").on(table.planId),
  ],
);

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    requestedByUserId: text("requested_by_user_id"),
    purpose: paymentRequestPurpose("purpose").notNull().default("subscription"),
    planId: uuid("plan_id").references(() => plans.id),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    method: paymentMethod("payment_method").notNull().default("bkash"),
    senderBkashNumber: varchar("sender_bkash_number", { length: 30 }).notNull(),
    transactionId: varchar("transaction_id", { length: 100 }).notNull(),
    status: paymentRequestStatus("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => platformOwners.userId),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_requests_workspace_status_idx").on(table.workspaceId, table.status),
    index("payment_requests_status_created_idx").on(table.status, table.createdAt),
    index("payment_requests_plan_idx").on(table.planId),
    uniqueIndex("payment_requests_transaction_id_idx").on(table.transactionId),
    check("payment_requests_subscription_plan_chk", sql`${table.purpose} <> 'subscription' or ${table.planId} is not null`),
    check("payment_requests_amount_minor_nonnegative_chk", sql`${table.amountMinor} >= 0`),
    check("payment_requests_reviewed_at_status_chk", sql`(${table.status} = 'pending' and ${table.reviewedAt} is null) or (${table.status} <> 'pending' and ${table.reviewedAt} is not null)`),
  ],
);
