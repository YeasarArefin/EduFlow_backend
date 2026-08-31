import type { NextFunction, Request, Response } from "express";
import { resolveWorkspaceEntitlements } from "../services/workspace-entitlements";

export function requireFeatureEntitlement(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const workspaceId = req.workspaceContext?.workspaceId;
    if (!workspaceId) {
      res.status(403).json({ error: { code: "WORKSPACE_CONTEXT_REQUIRED", message: "Workspace context is required." } });
      return;
    }

    try {
      const entitlements = await resolveWorkspaceEntitlements(workspaceId);
      if (!entitlements.entitlements[featureKey]?.enabled) {
        res.status(403).json({ error: { code: "FEATURE_ENTITLEMENT_REQUIRED", message: "This feature is not enabled for the workspace.", featureKey } });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
