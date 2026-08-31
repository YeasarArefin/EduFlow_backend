import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { auth } from "../auth";

/** Resolves the Better Auth session and exposes its user identity downstream. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

    if (!session) {
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "A valid authentication session is required."
        }
      });
      return;
    }

    req.authenticatedUser = { id: session.user.id };
    next();
  } catch (error) {
    next(error);
  }
}
