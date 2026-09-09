import { and, eq } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { permissions, rolePermissions, workspaceRoleCodes } from '../database/schema/roles';
import {
  memberPermissionOverrides,
  workspaceCustomRolePermissions,
  workspaceRolePermissionOverrides,
} from '../database/schema/workspaces';
import type { WorkspaceContext } from '../types/workspace';

/** Resolves a member's effective permission: role grant first, then an explicit override. */
export async function hasWorkspacePermission(
  context: WorkspaceContext,
  permissionKey: string
): Promise<boolean> {
  if (context.roleCode === workspaceRoleCodes.owner) return true;

  return withWorkspaceContext(context.workspaceId, async (tx) => {
    const [permission] = await tx
      .select({ code: permissions.code })
      .from(permissions)
      .where(eq(permissions.key, permissionKey))
      .limit(1);

    if (!permission) return false;

    const [roleGrant] = context.customRoleId
      ? await tx
          .select({ allowed: workspaceCustomRolePermissions.allowed })
          .from(workspaceCustomRolePermissions)
          .where(
            and(
              eq(workspaceCustomRolePermissions.workspaceId, context.workspaceId),
              eq(workspaceCustomRolePermissions.roleId, context.customRoleId),
              eq(workspaceCustomRolePermissions.permissionCode, permission.code)
            )
          )
          .limit(1)
      : await tx
          .select({ allowed: rolePermissions.permissionCode })
          .from(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleCode, context.roleCode),
              eq(rolePermissions.permissionCode, permission.code)
            )
          )
          .limit(1);

    const [workspaceRoleOverride] = await tx
      .select({ allowed: workspaceRolePermissionOverrides.allowed })
      .from(workspaceRolePermissionOverrides)
      .where(
        and(
          eq(workspaceRolePermissionOverrides.workspaceId, context.workspaceId),
          eq(workspaceRolePermissionOverrides.roleCode, context.roleCode),
          eq(workspaceRolePermissionOverrides.permissionCode, permission.code)
        )
      )
      .limit(1);

    const [override] = await tx
      .select({ allowed: memberPermissionOverrides.allowed })
      .from(memberPermissionOverrides)
      .where(
        and(
          eq(memberPermissionOverrides.workspaceId, context.workspaceId),
          eq(memberPermissionOverrides.memberId, context.membershipId),
          eq(memberPermissionOverrides.permissionCode, permission.code)
        )
      )
      .limit(1);

    return (
      override?.allowed ??
      (context.customRoleId
        ? Boolean(roleGrant?.allowed)
        : (workspaceRoleOverride?.allowed ?? Boolean(roleGrant)))
    );
  });
}
