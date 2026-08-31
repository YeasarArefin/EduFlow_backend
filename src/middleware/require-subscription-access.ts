import type { NextFunction, Request, Response } from "express";
import { resolveWorkspaceSubscriptionAccess } from "../services/subscription-access";

export async function requireWorkspaceSubscriptionAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const workspaceId = req.workspaceContext?.workspaceId;
  if (!workspaceId) {
    res.status(403).json({
      error: {
        code: "WORKSPACE_CONTEXT_REQUIRED",
        message: "Workspace context is required."
      }
    });
    return;
  }

  try {
    const access = await resolveWorkspaceSubscriptionAccess(workspaceId);
    if (!access.allowed) {
      res.status(403).json({
        error: {
          code: "SUBSCRIPTION_ACCESS_REQUIRED",
          message: access.reason,
          status: access.status
        }
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
