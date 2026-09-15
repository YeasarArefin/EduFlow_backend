import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { auth } from '../auth';
import { db } from '../database/client';
import { session as authSession } from '../database/schema/auth';
import { eq } from 'drizzle-orm';

/** Resolves the Better Auth session and exposes its user identity downstream. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'A valid authentication session is required.',
        },
      });
      return;
    }

    if (!session.user.emailVerified) {
      res.status(403).json({
        error: {
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Verify your email address before accessing EduFlow.',
        },
      });
      return;
    }

    // Better Auth validates the token before this write. Updating the session record
    // makes the device list useful without introducing a second session store.
    await db
      .update(authSession)
      .set({ updatedAt: new Date() })
      .where(eq(authSession.id, session.session.id));

    req.authenticatedUser = { id: session.user.id, sessionId: session.session.id };
    next();
  } catch (error) {
    next(error);
  }
}
