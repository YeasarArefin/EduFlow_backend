import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  primaryKey,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  integer,
} from 'drizzle-orm/pg-core';
import { permissions, workspaceRoles } from './roles';

export const workspaceStatus = pgEnum('workspace_status', [
  'pending',
  'active',
  'locked',
  'suspended',
  'scheduled_deletion',
  'deleted',
]);

export const memberStatus = pgEnum('member_status', ['invited', 'active', 'suspended', 'removed']);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 150 }),
    slug: varchar('slug', { length: 100 }).unique(),
    status: workspaceStatus('status').notNull().default('pending'),
    createdByUserId: text('created_by_user_id'),
    logoPath: text('logo_path'),
    phone: varchar('phone', { length: 30 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    scheduledDeleteAt: timestamp('scheduled_delete_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workspaces_status_idx').on(table.status),
    index('workspaces_scheduled_delete_idx').on(table.scheduledDeleteAt),
    uniqueIndex('workspaces_created_by_user_unique')
      .on(table.createdByUserId)
      .where(sql`${table.createdByUserId} is not null`),
  ]
);

export const workspaceSettings = pgTable(
  'workspace_settings',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id),
    defaultFeeDueDay: smallint('default_fee_due_day'),
    gracePeriodDays: smallint('grace_period_days').notNull().default(0),
    receiptPrefix: varchar('receipt_prefix', { length: 20 }),
    defaultLanguage: varchar('default_language', { length: 10 }).notNull().default('bn'),
    absenceEmailEnabled: boolean('absence_email_enabled').notNull().default(true),
    absenceEmailRecipient: varchar('absence_email_recipient', { length: 20 })
      .notNull()
      .default('guardian'),
    smsDefaultSenderId: varchar('sms_default_sender_id', { length: 100 }),
    paymentConfirmationEnabled: boolean('payment_confirmation_enabled').notNull().default(true),
    paymentReminderEnabled: boolean('payment_reminder_enabled').notNull().default(true),
    graceReminderEnabled: boolean('grace_reminder_enabled').notNull().default(true),
    overdueWarningEnabled: boolean('overdue_warning_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('workspace_settings_default_language_chk', sql`${table.defaultLanguage} in ('bn', 'en')`),
  ]
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    // Better Auth owns the referenced `user` table, introduced with authentication.
    userId: text('user_id').notNull(),
    roleCode: smallint('role_code')
      .notNull()
      .references(() => workspaceRoles.code),
    customRoleId: uuid('custom_role_id'),
    status: memberStatus('status').notNull().default('active'),
    invitedBy: text('invited_by'),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_members_workspace_user_idx').on(table.workspaceId, table.userId),
    index('workspace_members_user_idx').on(table.userId),
    index('workspace_members_workspace_role_idx').on(table.workspaceId, table.roleCode),
  ]
);

/** Workspace-owned roles replace the old shared Admin, Teacher, and Staff presets. */
export const workspaceCustomRoles = pgTable(
  'workspace_custom_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: varchar('name', { length: 50 }).notNull(),
    description: text('description'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_custom_roles_workspace_name_idx').on(table.workspaceId, table.name),
    index('workspace_custom_roles_workspace_idx').on(table.workspaceId),
  ]
);

export const workspaceCustomRolePermissions = pgTable(
  'workspace_custom_role_permissions',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => workspaceCustomRoles.id),
    permissionCode: integer('permission_code')
      .notNull()
      .references(() => permissions.code),
    allowed: boolean('allowed').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.roleId, table.permissionCode] }),
    index('workspace_custom_role_permissions_role_idx').on(table.roleId),
  ]
);

export const memberPermissionOverrides = pgTable(
  'member_permission_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => workspaceMembers.id),
    permissionCode: integer('permission_code')
      .notNull()
      .references(() => permissions.code),
    allowed: boolean('allowed').notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('member_permission_overrides_member_permission_idx').on(
      table.memberId,
      table.permissionCode
    ),
    index('member_permission_overrides_workspace_idx').on(table.workspaceId),
    index('member_permission_overrides_permission_idx').on(table.permissionCode),
  ]
);

/** Workspace-scoped role grants override the seeded global role defaults. */
export const workspaceRolePermissionOverrides = pgTable(
  'workspace_role_permission_overrides',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    roleCode: smallint('role_code')
      .notNull()
      .references(() => workspaceRoles.code),
    permissionCode: integer('permission_code')
      .notNull()
      .references(() => permissions.code),
    allowed: boolean('allowed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.roleCode, table.permissionCode] }),
    index('workspace_role_permission_overrides_permission_idx').on(table.permissionCode),
  ]
);
