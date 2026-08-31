import { randomUUID } from "node:crypto";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "../../auth";
import { env } from "../../config/env";
import { db } from "../client";
import { account, session, user } from "../schema/auth";
import { platformOwners } from "../schema/platform";

export const DEVELOPMENT_PLATFORM_OWNER = {
  email: "admin@admin.com",
  password: "123456789789",
  name: "Development Platform Owner"
} as const;

type Environment = "development" | "test" | "production";

export async function seedDevelopmentPlatformOwner(environment: Environment = env.NODE_ENV): Promise<boolean> {
  if (environment !== "development") return false;

  const userId = await ensureDevelopmentUser();
  const passwordHash = await hashPassword(DEVELOPMENT_PLATFORM_OWNER.password);
  const credentialIssuer = createLocalAccountIssuer("credential");
  const now = new Date();

  await db.transaction(async (transaction) => {
    await transaction.delete(session).where(eq(session.userId, userId));
    await transaction
      .delete(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
    await transaction.insert(account).values({
      id: randomUUID(),
      issuer: credentialIssuer,
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now
    });

    const [platformOwner] = await transaction
      .select({ id: platformOwners.id })
      .from(platformOwners)
      .limit(1);

    if (platformOwner) {
      await transaction
        .update(platformOwners)
        .set({ userId })
        .where(eq(platformOwners.id, platformOwner.id));
      return;
    }

    await transaction.insert(platformOwners).values({ userId });
  });

  return true;
}

async function ensureDevelopmentUser() {
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEVELOPMENT_PLATFORM_OWNER.email))
    .limit(1);

  if (existingUser) return existingUser.id;

  const result = await auth.api.signUpEmail({
    body: {
      name: DEVELOPMENT_PLATFORM_OWNER.name,
      email: DEVELOPMENT_PLATFORM_OWNER.email,
      password: DEVELOPMENT_PLATFORM_OWNER.password
    }
  });

  return result.user.id;
}
