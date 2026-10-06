import type { IncomingHttpHeaders } from 'node:http';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import { db } from '../database/client';
import { account, session, user } from '../database/schema/auth';
import { auth } from '../auth';
import { AppError } from '../middleware/error-handler';

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

export const SESSION_LIMIT = 2;

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
  const os = /iPhone|iPad/i.test(userAgent)
    ? 'iOS'
    : /Android/i.test(userAgent)
      ? 'Android'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

export function getSessionLimit(_userId?: string): Promise<number> {
  return Promise.resolve(SESSION_LIMIT);
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

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId));
}

export async function getActiveDevicesByCredentials(
  email: string,
  password: string
): Promise<ActiveSession[]> {
  const normalizedEmail = email.toLowerCase().trim();
  const [userRow] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1);

  if (!userRow) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  const [accountRow] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userRow.id), eq(account.providerId, 'credential')))
    .limit(1);

  if (!accountRow || !accountRow.password) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  const isPasswordValid = await verifyPassword({
    hash: accountRow.password,
    password,
  });

  if (!isPasswordValid) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  return getActiveSessions(userRow.id);
}

export async function takeoverSession(
  email: string,
  password: string,
  headers?: IncomingHttpHeaders
): Promise<{ user: unknown; session: unknown; setCookieHeaders?: string[] }> {
  const normalizedEmail = email.toLowerCase().trim();
  const [userRow] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
    })
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1);

  if (!userRow) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  const [accountRow] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userRow.id), eq(account.providerId, 'credential')))
    .limit(1);

  if (!accountRow || !accountRow.password) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  const isPasswordValid = await verifyPassword({
    hash: accountRow.password,
    password,
  });

  if (!isPasswordValid) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  // Revoke all existing sessions for this user
  await revokeAllSessions(userRow.id);

  // Sign in via Better Auth API with asResponse: true
  const reqHeaders = new Headers();
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const v of value) reqHeaders.append(key, v);
      } else if (value !== undefined) {
        reqHeaders.set(key, value);
      }
    }
  }

  const response = await auth.api.signInEmail({
    body: {
      email: userRow.email,
      password,
    },
    headers: reqHeaders,
    asResponse: true,
  });

  const responseBody = (await response.json()) as {
    user: unknown;
    session: unknown;
  } & Record<string, unknown>;
  const getSetCookieFn = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookie =
    typeof getSetCookieFn === 'function'
      ? getSetCookieFn.call(response.headers)
      : [response.headers.get('set-cookie')].filter(Boolean);

  return {
    user: responseBody.user,
    session: responseBody.session,
    setCookieHeaders: setCookie as string[],
  };
}
