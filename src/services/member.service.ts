import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { auth } from "../auth";
import { withWorkspaceContext } from "../database/client";
import { user } from "../database/schema/auth";
import { workspaceRoleCodes } from "../database/schema/roles";
import { workspaceCustomRoles, workspaceMembers } from "../database/schema/workspaces";
import { AppError } from "../middleware/error-handler";
import { recordAuditLog } from "./audit-log.service";
import type { z } from "zod";
import type {
  createMemberSchema,
  listMembersQuerySchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema
} from "../validation/member.validation";

type ListInput = z.infer<typeof listMembersQuerySchema>;
type CreateInput = z.infer<typeof createMemberSchema>;
type RoleInput = z.infer<typeof updateMemberRoleSchema>;
type StatusInput = z.infer<typeof updateMemberStatusSchema>;
type Transaction = Parameters<Parameters<typeof withWorkspaceContext>[1]>[0];

const memberColumns = {
  id: workspaceMembers.id,
  userId: workspaceMembers.userId,
  name: user.name,
  email: user.email,
  role: workspaceCustomRoles.name,
  roleId: workspaceMembers.customRoleId,
  roleCode: workspaceMembers.roleCode,
  status: workspaceMembers.status,
  joinedAt: workspaceMembers.joinedAt,
  createdAt: workspaceMembers.createdAt
};

function memberResponse(member: typeof memberColumns extends never ? never : Record<string, unknown>) {
  return {
    ...member,
    role: member.roleCode === workspaceRoleCodes.owner ? "Owner" : member.role,
    roleId: member.roleCode === workspaceRoleCodes.owner ? null : member.roleId
  };
}

async function findRole(tx: Transaction, workspaceId: string, roleId: string) {
  const [role] = await tx
    .select()
    .from(workspaceCustomRoles)
    .where(and(eq(workspaceCustomRoles.workspaceId, workspaceId), eq(workspaceCustomRoles.id, roleId)))
    .limit(1);
  if (!role) throw new AppError("ROLE_NOT_FOUND", "The selected role does not belong to this workspace.", 404);
  return role;
}

async function findMember(tx: Transaction, workspaceId: string, id: string) {
  const [member] = await tx
    .select(memberColumns)
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .leftJoin(workspaceCustomRoles, eq(workspaceMembers.customRoleId, workspaceCustomRoles.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.id, id)))
    .limit(1);
  if (!member) throw new AppError("MEMBER_NOT_FOUND", "The workspace member was not found.", 404);
  return member;
}

function assertNotOwner(roleCode: number) {
  if (roleCode === workspaceRoleCodes.owner)
    throw new AppError("OWNER_MEMBER_PROTECTED", "The workspace owner cannot be changed, suspended, or removed.", 409);
}

export async function listMembers(workspaceId: string, input: ListInput) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const filters = [eq(workspaceMembers.workspaceId, workspaceId)];
    if (input.status) filters.push(eq(workspaceMembers.status, input.status));
    if (input.roleId) filters.push(eq(workspaceMembers.customRoleId, input.roleId));
    if (input.search) {
      const term = `%${input.search}%`;
      filters.push(or(ilike(user.name, term), ilike(user.email, term))!);
    }
    const where = and(...filters);
    const [data, totals] = await Promise.all([
      tx
        .select(memberColumns)
        .from(workspaceMembers)
        .innerJoin(user, eq(workspaceMembers.userId, user.id))
        .leftJoin(workspaceCustomRoles, eq(workspaceMembers.customRoleId, workspaceCustomRoles.id))
        .where(where)
        .orderBy(asc(user.name), desc(workspaceMembers.createdAt))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit),
      tx
        .select({ total: count() })
        .from(workspaceMembers)
        .innerJoin(user, eq(workspaceMembers.userId, user.id))
        .where(where)
    ]);
    const total = Number(totals[0]?.total ?? 0);
    return {
      data: data.map(memberResponse),
      meta: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) }
    };
  });
}

export async function addMember(workspaceId: string, actorUserId: string, input: CreateInput) {
  let accountId: string | undefined;
  try {
    const account = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password }
    });
    accountId = account.user.id;
    return await withWorkspaceContext(workspaceId, async (tx) => {
      const role = await findRole(tx, workspaceId, input.roleId);
      const now = new Date();
      const [member] = await tx
        .insert(workspaceMembers)
        .values({
          workspaceId,
          userId: accountId!,
          roleCode: workspaceRoleCodes.staff,
          customRoleId: role.id,
          status: "active",
          invitedBy: actorUserId,
          joinedAt: now,
          updatedAt: now
        })
        .returning();
      await recordAuditLog(tx, {
        actorUserId,
        action: "member.account_created",
        entityType: "workspace_member",
        entityId: member.id,
        workspaceId,
        metadata: { email: input.email, roleId: role.id }
      });
      return { ...member, name: account.user.name, email: account.user.email, role: role.name, roleId: role.id };
    });
  } catch (error) {
    if (accountId)
      await withWorkspaceContext(workspaceId, async (tx) => tx.delete(user).where(eq(user.id, accountId!)));
    throw error;
  }
}

export async function updateMemberRole(workspaceId: string, actorUserId: string, id: string, input: RoleInput) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const member = await findMember(tx, workspaceId, id);
    assertNotOwner(member.roleCode);
    const role = await findRole(tx, workspaceId, input.roleId);
    const [updated] = await tx
      .update(workspaceMembers)
      .set({ customRoleId: role.id, updatedAt: new Date() })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.id, id)))
      .returning();
    await recordAuditLog(tx, {
      actorUserId,
      action: "member.role_changed",
      entityType: "workspace_member",
      entityId: id,
      workspaceId,
      metadata: { roleId: role.id }
    });
    return { ...updated, name: member.name, email: member.email, role: role.name, roleId: role.id };
  });
}

export async function updateMemberStatus(workspaceId: string, actorUserId: string, id: string, input: StatusInput) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const member = await findMember(tx, workspaceId, id);
    assertNotOwner(member.roleCode);
    const [updated] = await tx
      .update(workspaceMembers)
      .set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.id, id)))
      .returning();
    await recordAuditLog(tx, {
      actorUserId,
      action: input.status === "suspended" ? "member.suspended" : "member.reactivated",
      entityType: "workspace_member",
      entityId: id,
      workspaceId,
      metadata: { status: input.status }
    });
    return { ...updated, name: member.name, email: member.email, role: member.role, roleId: member.roleId };
  });
}

export async function removeMember(workspaceId: string, actorUserId: string, id: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const member = await findMember(tx, workspaceId, id);
    assertNotOwner(member.roleCode);
    const [updated] = await tx
      .update(workspaceMembers)
      .set({ status: "removed", updatedAt: new Date() })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.id, id)))
      .returning();
    await recordAuditLog(tx, {
      actorUserId,
      action: "member.removed",
      entityType: "workspace_member",
      entityId: id,
      workspaceId,
      metadata: { email: member.email }
    });
    return { ...updated, name: member.name, email: member.email, role: member.role, roleId: member.roleId };
  });
}
