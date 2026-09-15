import type { RequestHandler } from 'express';
import { getActiveSessions, revokeOtherSessions, revokeSession } from '../services/session-management.service';
import { AppError } from '../middleware/error-handler';

export const listActiveSessionsController: RequestHandler = async (req, res, next) => {
  try {
    const user = req.authenticatedUser!;
    res.json({ data: await getActiveSessions(user.id, user.sessionId) });
  } catch (error) { next(error); }
};

export const revokeSessionController: RequestHandler = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    if (typeof sessionId !== 'string' || !sessionId) throw new AppError('VALIDATION_ERROR', 'A valid session ID is required.', 400);
    await revokeSession(req.authenticatedUser!.id, sessionId);
    res.status(204).end();
  } catch (error) { next(error); }
};

export const revokeOtherSessionsController: RequestHandler = async (req, res, next) => {
  try {
    await revokeOtherSessions(req.authenticatedUser!.id, req.authenticatedUser!.sessionId);
    res.status(204).end();
  } catch (error) { next(error); }
};
