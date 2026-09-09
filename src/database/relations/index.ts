import { relations } from 'drizzle-orm';
import { platformOwners } from '../schema/platform';
import { permissions, rolePermissions, workspaceRoles } from '../schema/roles';
import {
  memberPermissionOverrides,
  workspaceCustomRolePermissions,
  workspaceCustomRoles,
  workspaceMembers,
  workspaceRolePermissionOverrides,
  workspaceSettings,
  workspaces,
} from '../schema/workspaces';
import { students } from '../schema/students';
import { batches, batchEnrollments, batchTeachers } from '../schema/batches';
import { teachers } from '../schema/teachers';
import { studentFees, studentPayments } from '../schema/fees';
import { attendanceRecords, attendanceSessions } from '../schema/attendance';
import { teacherSalaries } from '../schema/teacher-salaries';
import {
  features,
  planFeatures,
  plans,
  paymentRequests,
  subscriptions,
  workspaceEntitlementOverrides,
} from '../schema/subscriptions';

export const platformOwnersRelations = relations(platformOwners, () => ({}));

export const workspaceRolesRelations = relations(workspaceRoles, ({ many }) => ({
  permissions: many(rolePermissions),
  workspacePermissionOverrides: many(workspaceRolePermissionOverrides),
  members: many(workspaceMembers),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
  workspaceRoleOverrides: many(workspaceRolePermissionOverrides),
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
  rolePermissionOverrides: many(workspaceRolePermissionOverrides),
  customRoles: many(workspaceCustomRoles),
  entitlementOverrides: many(workspaceEntitlementOverrides),
  subscriptions: many(subscriptions),
  paymentRequests: many(paymentRequests),
  students: many(students),
  batches: many(batches),
  batchTeachers: many(batchTeachers),
  batchEnrollments: many(batchEnrollments),
  studentFees: many(studentFees),
  studentPayments: many(studentPayments),
  attendanceSessions: many(attendanceSessions),
  attendanceRecords: many(attendanceRecords),
  teacherSalaries: many(teacherSalaries),
}));

export const studentsRelations = relations(students, ({ many, one }) => ({
  workspace: one(workspaces, { fields: [students.workspaceId], references: [workspaces.id] }),
  enrollments: many(batchEnrollments),
  fees: many(studentFees),
  payments: many(studentPayments),
  attendanceRecords: many(attendanceRecords),
}));

export const batchesRelations = relations(batches, ({ many, one }) => ({
  workspace: one(workspaces, { fields: [batches.workspaceId], references: [workspaces.id] }),
  teachers: many(batchTeachers),
  enrollments: many(batchEnrollments),
  attendanceSessions: many(attendanceSessions),
}));

export const batchEnrollmentsRelations = relations(batchEnrollments, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [batchEnrollments.workspaceId],
    references: [workspaces.id],
  }),
  batch: one(batches, { fields: [batchEnrollments.batchId], references: [batches.id] }),
  student: one(students, { fields: [batchEnrollments.studentId], references: [students.id] }),
  fees: many(studentFees),
}));

export const studentFeesRelations = relations(studentFees, ({ many, one }) => ({
  workspace: one(workspaces, { fields: [studentFees.workspaceId], references: [workspaces.id] }),
  student: one(students, { fields: [studentFees.studentId], references: [students.id] }),
  enrollment: one(batchEnrollments, {
    fields: [studentFees.enrollmentId],
    references: [batchEnrollments.id],
  }),
  payments: many(studentPayments),
}));

export const studentPaymentsRelations = relations(studentPayments, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [studentPayments.workspaceId],
    references: [workspaces.id],
  }),
  student: one(students, { fields: [studentPayments.studentId], references: [students.id] }),
  fee: one(studentFees, { fields: [studentPayments.studentFeeId], references: [studentFees.id] }),
}));

export const attendanceSessionsRelations = relations(attendanceSessions, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [attendanceSessions.workspaceId],
    references: [workspaces.id],
  }),
  batch: one(batches, { fields: [attendanceSessions.batchId], references: [batches.id] }),
  records: many(attendanceRecords),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [attendanceRecords.workspaceId],
    references: [workspaces.id],
  }),
  session: one(attendanceSessions, {
    fields: [attendanceRecords.attendanceSessionId],
    references: [attendanceSessions.id],
  }),
  student: one(students, { fields: [attendanceRecords.studentId], references: [students.id] }),
}));

export const teachersRelations = relations(teachers, ({ many, one }) => ({
  workspace: one(workspaces, { fields: [teachers.workspaceId], references: [workspaces.id] }),
  batches: many(batchTeachers),
  salaries: many(teacherSalaries),
}));

export const teacherSalariesRelations = relations(teacherSalaries, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [teacherSalaries.workspaceId],
    references: [workspaces.id],
  }),
  teacher: one(teachers, { fields: [teacherSalaries.teacherId], references: [teachers.id] }),
}));

export const batchTeachersRelations = relations(batchTeachers, ({ one }) => ({
  workspace: one(workspaces, { fields: [batchTeachers.workspaceId], references: [workspaces.id] }),
  batch: one(batches, { fields: [batchTeachers.batchId], references: [batches.id] }),
  teacher: one(teachers, { fields: [batchTeachers.teacherId], references: [teachers.id] }),
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
  customRole: one(workspaceCustomRoles, {
    fields: [workspaceMembers.customRoleId],
    references: [workspaceCustomRoles.id],
  }),
  permissionOverrides: many(memberPermissionOverrides),
}));

export const workspaceCustomRolesRelations = relations(workspaceCustomRoles, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceCustomRoles.workspaceId],
    references: [workspaces.id],
  }),
  permissions: many(workspaceCustomRolePermissions),
  members: many(workspaceMembers),
}));

export const workspaceCustomRolePermissionsRelations = relations(
  workspaceCustomRolePermissions,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceCustomRolePermissions.workspaceId],
      references: [workspaces.id],
    }),
    role: one(workspaceCustomRoles, {
      fields: [workspaceCustomRolePermissions.roleId],
      references: [workspaceCustomRoles.id],
    }),
    permission: one(permissions, {
      fields: [workspaceCustomRolePermissions.permissionCode],
      references: [permissions.code],
    }),
  })
);

export const memberPermissionOverridesRelations = relations(
  memberPermissionOverrides,
  ({ one }) => ({
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
  })
);

export const workspaceRolePermissionOverridesRelations = relations(
  workspaceRolePermissionOverrides,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceRolePermissionOverrides.workspaceId],
      references: [workspaces.id],
    }),
    workspaceRole: one(workspaceRoles, {
      fields: [workspaceRolePermissionOverrides.roleCode],
      references: [workspaceRoles.code],
    }),
    permission: one(permissions, {
      fields: [workspaceRolePermissionOverrides.permissionCode],
      references: [permissions.code],
    }),
  })
);

export const plansRelations = relations(plans, ({ many }) => ({
  features: many(planFeatures),
  subscriptions: many(subscriptions),
  paymentRequests: many(paymentRequests),
}));

export const featuresRelations = relations(features, ({ many }) => ({
  plans: many(planFeatures),
  workspaceOverrides: many(workspaceEntitlementOverrides),
}));

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan: one(plans, { fields: [planFeatures.planId], references: [plans.id] }),
  feature: one(features, {
    fields: [planFeatures.featureKey],
    references: [features.key],
  }),
}));

export const workspaceEntitlementOverridesRelations = relations(
  workspaceEntitlementOverrides,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceEntitlementOverrides.workspaceId],
      references: [workspaces.id],
    }),
    feature: one(features, {
      fields: [workspaceEntitlementOverrides.featureKey],
      references: [features.key],
    }),
  })
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [subscriptions.workspaceId],
    references: [workspaces.id],
  }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));

export const paymentRequestsRelations = relations(paymentRequests, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [paymentRequests.workspaceId],
    references: [workspaces.id],
  }),
  plan: one(plans, {
    fields: [paymentRequests.planId],
    references: [plans.id],
  }),
}));
