import type { RequestHandler } from 'express';
import {
  getActiveDevicesByCredentials,
  getActiveSessions,
  revokeOtherSessions,
  revokeSession,
  takeoverSession,
} from '../services/session-management.service';
import { AppError } from '../middleware/error-handler';
import {
  activeDevicesQuerySchema,
  sessionTakeoverSchema,
} from '../validation/session.validation';

export const listActiveSessionsController: RequestHandler = async (req, res, next) => {
  try {
    const user = req.authenticatedUser!;
    res.json({ data: await getActiveSessions(user.id, user.sessionId) });
  } catch (error) {
    next(error);
  }
};

export const revokeSessionController: RequestHandler = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new AppError('VALIDATION_ERROR', 'A valid session ID is required.', 400);
    }
    await revokeSession(req.authenticatedUser!.id, sessionId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const revokeOtherSessionsController: RequestHandler = async (req, res, next) => {
  try {
    await revokeOtherSessions(req.authenticatedUser!.id, req.authenticatedUser!.sessionId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const sessionTakeoverController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = sessionTakeoverSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid request body.',
        400
      );
    }
    const { email, password } = parsed.data;
    const result = await takeoverSession(email, password, req.headers);
    if (result.setCookieHeaders && result.setCookieHeaders.length > 0) {
      res.setHeader('Set-Cookie', result.setCookieHeaders);
    }
    res.json({
      data: {
        user: result.user,
        session: result.session,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const activeDevicesController: RequestHandler = async (req, res, next) => {
  try {
    const parsed = activeDevicesQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid request body.',
        400
      );
    }
    const { email, password } = parsed.data;
    const devices = await getActiveDevicesByCredentials(email, password);
    res.json({ data: devices });
  } catch (error) {
    next(error);
  }
};
