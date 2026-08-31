import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "../database/client";
import { platformOwners } from "../database/schema/platform";

export async function requirePlatformOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.authenticatedUser?.id;
  if (!userId) {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "A valid authentication session is required."
      }
    });
    return;
  }

  try {
    const [owner] = await db
      .select({ userId: platformOwners.userId })
      .from(platformOwners)
      .where(eq(platformOwners.userId, userId))
      .limit(1);
    if (!owner) {
      res.status(403).json({
        error: {
          code: "PLATFORM_OWNER_REQUIRED",
          message: "Platform Owner access is required."
        }
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
