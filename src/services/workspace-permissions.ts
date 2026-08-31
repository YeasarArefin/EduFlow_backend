import { and, eq } from "drizzle-orm";
import { db } from "../database/client";
import { permissions, rolePermissions } from "../database/schema/roles";
import { memberPermissionOverrides } from "../database/schema/workspaces";
import type { WorkspaceContext } from "../types/workspace-context";

/** Resolves a member's effective permission: role grant first, then an explicit override. */
export async function hasWorkspacePermission(context: WorkspaceContext, permissionKey: string): Promise<boolean> {
  const [permission] = await db
    .select({ code: permissions.code })
    .from(permissions)
    .where(eq(permissions.key, permissionKey))
    .limit(1);

  if (!permission) return false;

  const [roleGrant] = await db
    .select({ permissionCode: rolePermissions.permissionCode })
    .from(rolePermissions)
    .where(and(eq(rolePermissions.roleCode, context.roleCode), eq(rolePermissions.permissionCode, permission.code)))
    .limit(1);

  const [override] = await db
    .select({ allowed: memberPermissionOverrides.allowed })
    .from(memberPermissionOverrides)
    .where(
      and(
        eq(memberPermissionOverrides.workspaceId, context.workspaceId),
        eq(memberPermissionOverrides.memberId, context.membershipId),
        eq(memberPermissionOverrides.permissionCode, permission.code),
      ),
    )
    .limit(1);

  return override?.allowed ?? Boolean(roleGrant);
}
