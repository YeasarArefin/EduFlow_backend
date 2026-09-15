import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { db } from '../database/client';
import { session } from '../database/schema/auth';
import { platformOwners } from '../database/schema/platform';
import { workspaceRoleCodes } from '../database/schema/roles';
import { workspaceMembers } from '../database/schema/workspaces';

export type ActiveSession = {
  id: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel: string;
  isCurrent: boolean;
};

function getDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Microsoft Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS X/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : 'Unknown OS';
  return `${browser} on ${os}`;
}

export async function getSessionLimit(userId: string): Promise<1 | 2> {
  const [platformOwner, workspaceOwner] = await Promise.all([
    db.select({ userId: platformOwners.userId }).from(platformOwners).where(eq(platformOwners.userId, userId)).limit(1),
    db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.roleCode, workspaceRoleCodes.owner),
          eq(workspaceMembers.status, 'active')
        )
      )
      .limit(1),
  ]);
  return platformOwner.length || workspaceOwner.length ? 2 : 1;
}

export async function getActiveSessions(userId: string, currentSessionId?: string): Promise<ActiveSession[]> {
  const rows = await db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    lastActiveAt: row.updatedAt,
    expiresAt: row.expiresAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    deviceLabel: getDeviceLabel(row.userAgent),
    isCurrent: row.id === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  await db.delete(session).where(and(eq(session.id, sessionId), eq(session.userId, userId)));
}

export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  await db.delete(session).where(and(eq(session.userId, userId), ne(session.id, currentSessionId)));
}
