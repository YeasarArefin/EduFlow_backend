import { relations } from "drizzle-orm";
import { platformOwners } from "../schema/platform";
import { permissions, rolePermissions, workspaceRoles } from "../schema/roles";
import { memberPermissionOverrides, workspaceMembers, workspaceSettings, workspaces } from "../schema/workspaces";
import {
  features,
  planFeatures,
  plans,
  subscriptions,
  workspaceEntitlementOverrides,
} from "../schema/subscriptions";

export const platformOwnersRelations = relations(platformOwners, () => ({}));

export const workspaceRolesRelations = relations(workspaceRoles, ({ many }) => ({
  permissions: many(rolePermissions),
  members: many(workspaceMembers),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
  memberOverrides: many(memberPermissionOverrides),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  workspaceRole: one(workspaceRoles, {
    fields: [rolePermissions.roleCode],
    references: [workspaceRoles.code],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionCode],
    references: [permissions.code],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  settings: one(workspaceSettings),
  members: many(workspaceMembers),
  memberPermissionOverrides: many(memberPermissionOverrides),
  entitlementOverrides: many(workspaceEntitlementOverrides),
  subscriptions: many(subscriptions),
}));

export const workspaceSettingsRelations = relations(workspaceSettings, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceSettings.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  workspaceRole: one(workspaceRoles, {
    fields: [workspaceMembers.roleCode],
    references: [workspaceRoles.code],
  }),
  permissionOverrides: many(memberPermissionOverrides),
}));

export const memberPermissionOverridesRelations = relations(memberPermissionOverrides, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memberPermissionOverrides.workspaceId],
    references: [workspaces.id],
  }),
  member: one(workspaceMembers, {
    fields: [memberPermissionOverrides.memberId],
    references: [workspaceMembers.id],
  }),
  permission: one(permissions, {
    fields: [memberPermissionOverrides.permissionCode],
    references: [permissions.code],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  features: many(planFeatures),
  subscriptions: many(subscriptions),
}));

export const featuresRelations = relations(features, ({ many }) => ({
  plans: many(planFeatures),
  workspaceOverrides: many(workspaceEntitlementOverrides),
}));

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan: one(plans, { fields: [planFeatures.planId], references: [plans.id] }),
  feature: one(features, { fields: [planFeatures.featureKey], references: [features.key] }),
}));

export const workspaceEntitlementOverridesRelations = relations(workspaceEntitlementOverrides, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceEntitlementOverrides.workspaceId], references: [workspaces.id] }),
  feature: one(features, { fields: [workspaceEntitlementOverrides.featureKey], references: [features.key] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(workspaces, { fields: [subscriptions.workspaceId], references: [workspaces.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));
