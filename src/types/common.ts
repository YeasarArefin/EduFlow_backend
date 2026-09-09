import type { db, withWorkspaceContext } from '../database/client';
import type { z } from 'zod';
import type { academicResourceSchema, createAcademicReferenceSchema } from '../validation/academic.validation';
import type { bulkSaveAttendanceSchema, createAttendanceSessionSchema, listAttendanceSessionsQuerySchema } from '../validation/attendance.validation';
import type { createMemberSchema, listMembersQuerySchema, updateMemberRoleSchema, updateMemberStatusSchema } from '../validation/member.validation';
import type { createRoleSchema, updateMemberOverridesSchema, updateRoleSchema } from '../validation/permission-management.validation';
import type { updateWorkspaceSettingsSchema } from '../validation/workspace-settings.validation';

export type WorkspaceTransaction = Parameters<Parameters<typeof withWorkspaceContext>[1]>[0];
export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type AuditExecutor = Pick<typeof db, 'insert'>;

export type AuditLogInput = {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    workspaceId?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
};

export type ActivityListInput = {
    page: number;
    limit: number;
    search?: string;
    category?: 'payment' | 'plan' | 'entitlement' | 'lifecycle';
};

export type AcademicResource = z.infer<typeof academicResourceSchema>;
export type AcademicReferenceInput = z.infer<typeof createAcademicReferenceSchema>;
export type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;
export type BulkSaveAttendanceInput = z.infer<typeof bulkSaveAttendanceSchema>;
export type ListAttendanceSessionsInput = z.infer<typeof listAttendanceSessionsQuerySchema>;
export type MemberListInput = z.infer<typeof listMembersQuerySchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateMemberOverridesInput = z.infer<typeof updateMemberOverridesSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateWorkspaceSettingsInput = z.infer<typeof updateWorkspaceSettingsSchema>;
