import { and, asc, eq, inArray } from "drizzle-orm";
import { withWorkspaceContext } from "../database/client";
import { user } from "../database/schema/auth";
import { permissions, workspaceRoleCodes } from "../database/schema/roles";
import {
  memberPermissionOverrides,
  workspaceCustomRolePermissions,
  workspaceCustomRoles,
  workspaceMembers
} from "../database/schema/workspaces";
import { AppError } from "../middleware/error-handler";
import { recordAuditLog } from "./audit-log.service";
import type { z } from "zod";
import type {
  createRoleSchema,
  updateMemberOverridesSchema,
  updateRoleSchema
} from "../validation/permission-management.validation";

type RoleInput = z.infer<typeof createRoleSchema>;
type OverrideInput = z.infer<typeof updateMemberOverridesSchema>;
type Transaction = Parameters<Parameters<typeof withWorkspaceContext>[1]>[0];

async function assertPermissionCodes(tx: Transaction, codes: number[]) {
  const rows = codes.length
    ? await tx.select({ code: permissions.code }).from(permissions).where(inArray(permissions.code, codes))
    : [];
  if (rows.length !== codes.length)
    throw new AppError("PERMISSION_NOT_FOUND", "One or more permissions do not exist.", 400);
}

async function getRole(tx: Transaction, workspaceId: string, roleId: string) {
  const [role] = await tx
    .select()
    .from(workspaceCustomRoles)
    .where(and(eq(workspaceCustomRoles.workspaceId, workspaceId), eq(workspaceCustomRoles.id, roleId)))
    .limit(1);
  if (!role) throw new AppError("ROLE_NOT_FOUND", "The role was not found in this workspace.", 404);
  return role;
}

async function getEditableMember(tx: Transaction, workspaceId: string, memberId: string) {
  const [member] = await tx
    .select({
      id: workspaceMembers.id,
      roleCode: workspaceMembers.roleCode,
      roleId: workspaceMembers.customRoleId,
      name: user.name,
      email: user.email
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.id, memberId)))
    .limit(1);
  if (!member) throw new AppError("MEMBER_NOT_FOUND", "The workspace member was not found.", 404);
  if (member.roleCode === workspaceRoleCodes.owner)
    throw new AppError("OWNER_MEMBER_PROTECTED", "The workspace owner's permissions cannot be changed.", 409);
  if (!member.roleId)
    throw new AppError(
      "ROLE_NOT_FOUND",
      "This member must be assigned a workspace role before permissions can be changed.",
      409
    );
  return member;
}

export async function getPermissionConfiguration(workspaceId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [permissionRows, roles, grants] = await Promise.all([
      tx
        .select({
          code: permissions.code,
          key: permissions.key,
          name: permissions.name,
          module: permissions.module,
          description: permissions.description
        })
        .from(permissions)
        .orderBy(asc(permissions.module), asc(permissions.key)),
      tx
        .select({
          id: workspaceCustomRoles.id,
          name: workspaceCustomRoles.name,
          description: workspaceCustomRoles.description
        })
        .from(workspaceCustomRoles)
        .where(eq(workspaceCustomRoles.workspaceId, workspaceId))
        .orderBy(asc(workspaceCustomRoles.name)),
      tx
        .select({
          roleId: workspaceCustomRolePermissions.roleId,
          permissionCode: workspaceCustomRolePermissions.permissionCode,
          allowed: workspaceCustomRolePermissions.allowed
        })
        .from(workspaceCustomRolePermissions)
        .where(eq(workspaceCustomRolePermissions.workspaceId, workspaceId))
    ]);
    const grantsByRole = new Map<string, Map<number, boolean>>();
    for (const grant of grants) {
      const role = grantsByRole.get(grant.roleId) ?? new Map<number, boolean>();
      role.set(grant.permissionCode, grant.allowed);
      grantsByRole.set(grant.roleId, role);
    }
    return {
      roles,
      permissions: permissionRows.map((permission) => ({
        ...permission,
        roles: roles.reduce<Record<string, boolean>>((result, role) => {
          result[role.id] = grantsByRole.get(role.id)?.get(permission.code) ?? false;
          return result;
        }, {})
      }))
    };
  });
}

async function saveRolePermissions(tx: Transaction, workspaceId: string, roleId: string, input: RoleInput) {
  await assertPermissionCodes(
    tx,
    input.permissions.map((item) => item.permissionCode)
  );
  await tx
    .delete(workspaceCustomRolePermissions)
    .where(
      and(
        eq(workspaceCustomRolePermissions.workspaceId, workspaceId),
        eq(workspaceCustomRolePermissions.roleId, roleId)
      )
    );
  if (input.permissions.length)
    await tx
      .insert(workspaceCustomRolePermissions)
      .values(
        input.permissions.map((item) => ({
          workspaceId,
          roleId,
          permissionCode: item.permissionCode,
          allowed: item.allowed
        }))
      );
}

export async function createWorkspaceRole(workspaceId: string, actorUserId: string, input: RoleInput) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [role] = await tx
      .insert(workspaceCustomRoles)
      .values({ workspaceId, name: input.name, description: input.description, createdBy: actorUserId })
      .returning();
    await saveRolePermissions(tx, workspaceId, role.id, input);
    await recordAuditLog(tx, {
      actorUserId,
      action: "role.created",
      entityType: "workspace_role",
      entityId: role.id,
      workspaceId,
      metadata: { name: role.name, permissionCount: input.permissions.length }
    });
    return role;
  });
}

export async function updateWorkspaceRole(
  workspaceId: string,
  actorUserId: string,
  roleId: string,
  input: z.infer<typeof updateRoleSchema>
) {
  await withWorkspaceContext(workspaceId, async (tx) => {
    await getRole(tx, workspaceId, roleId);
    await tx
      .update(workspaceCustomRoles)
      .set({ name: input.name, description: input.description, updatedAt: new Date() })
      .where(and(eq(workspaceCustomRoles.workspaceId, workspaceId), eq(workspaceCustomRoles.id, roleId)));
    await saveRolePermissions(tx, workspaceId, roleId, input);
    await recordAuditLog(tx, {
      actorUserId,
      action: "role.updated",
      entityType: "workspace_role",
      entityId: roleId,
      workspaceId,
      metadata: { name: input.name, permissionCount: input.permissions.length }
    });
  });
  return getPermissionConfiguration(workspaceId);
}

export async function deleteWorkspaceRole(workspaceId: string, actorUserId: string, roleId: string) {
  await withWorkspaceContext(workspaceId, async (tx) => {
    await getRole(tx, workspaceId, roleId);
    const [assigned] = await tx
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.customRoleId, roleId)))
      .limit(1);
    if (assigned) throw new AppError("ROLE_IN_USE", "Move members to another role before deleting this role.", 409);
    await tx
      .delete(workspaceCustomRolePermissions)
      .where(
        and(
          eq(workspaceCustomRolePermissions.workspaceId, workspaceId),
          eq(workspaceCustomRolePermissions.roleId, roleId)
        )
      );
    await tx
      .delete(workspaceCustomRoles)
      .where(and(eq(workspaceCustomRoles.workspaceId, workspaceId), eq(workspaceCustomRoles.id, roleId)));
    await recordAuditLog(tx, {
      actorUserId,
      action: "role.deleted",
      entityType: "workspace_role",
      entityId: roleId,
      workspaceId
    });
  });
}

export async function getMemberPermissionOverrides(workspaceId: string, memberId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const member = await getEditableMember(tx, workspaceId, memberId);
    const [permissionRows, roleRows, overrideRows] = await Promise.all([
      tx
        .select({
          code: permissions.code,
          key: permissions.key,
          name: permissions.name,
          module: permissions.module,
          description: permissions.description
        })
        .from(permissions)
        .orderBy(asc(permissions.module), asc(permissions.key)),
      tx
        .select({
          permissionCode: workspaceCustomRolePermissions.permissionCode,
          allowed: workspaceCustomRolePermissions.allowed
        })
        .from(workspaceCustomRolePermissions)
        .where(
          and(
            eq(workspaceCustomRolePermissions.workspaceId, workspaceId),
            eq(workspaceCustomRolePermissions.roleId, member.roleId!)
          )
        ),
      tx
        .select({
          permissionCode: memberPermissionOverrides.permissionCode,
          allowed: memberPermissionOverrides.allowed
        })
        .from(memberPermissionOverrides)
        .where(
          and(eq(memberPermissionOverrides.workspaceId, workspaceId), eq(memberPermissionOverrides.memberId, memberId))
        )
    ]);
    const rolePermissions = new Map(roleRows.map((row) => [row.permissionCode, row.allowed]));
    const overrides = new Map(overrideRows.map((row) => [row.permissionCode, row.allowed]));
    return {
      member,
      permissions: permissionRows.map((permission) => ({
        ...permission,
        inheritedAllowed: rolePermissions.get(permission.code) ?? false,
        overrideAllowed: overrides.get(permission.code) ?? null
      }))
    };
  });
}

export async function updateMemberPermissionOverrides(
  workspaceId: string,
  actorUserId: string,
  memberId: string,
  input: OverrideInput
) {
  await withWorkspaceContext(workspaceId, async (tx) => {
    await getEditableMember(tx, workspaceId, memberId);
    await assertPermissionCodes(
      tx,
      input.overrides.map((item) => item.permissionCode)
    );
    await tx
      .delete(memberPermissionOverrides)
      .where(
        and(eq(memberPermissionOverrides.workspaceId, workspaceId), eq(memberPermissionOverrides.memberId, memberId))
      );
    if (input.overrides.length)
      await tx
        .insert(memberPermissionOverrides)
        .values(
          input.overrides.map((item) => ({
            workspaceId,
            memberId,
            permissionCode: item.permissionCode,
            allowed: item.allowed,
            createdBy: actorUserId
          }))
        );
    await recordAuditLog(tx, {
      actorUserId,
      action: "permission.member_overrides_updated",
      entityType: "workspace_member",
      entityId: memberId,
      workspaceId,
      metadata: { overrideCount: input.overrides.length }
    });
  });
  return getMemberPermissionOverrides(workspaceId, memberId);
}

export async function resetMemberPermissionOverrides(workspaceId: string, actorUserId: string, memberId: string) {
  await withWorkspaceContext(workspaceId, async (tx) => {
    await getEditableMember(tx, workspaceId, memberId);
    await tx
      .delete(memberPermissionOverrides)
      .where(
        and(eq(memberPermissionOverrides.workspaceId, workspaceId), eq(memberPermissionOverrides.memberId, memberId))
      );
    await recordAuditLog(tx, {
      actorUserId,
      action: "permission.member_overrides_reset",
      entityType: "workspace_member",
      entityId: memberId,
      workspaceId
    });
  });
  return getMemberPermissionOverrides(workspaceId, memberId);
}
