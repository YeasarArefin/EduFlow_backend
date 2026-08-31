import type { NextFunction, Request, Response } from "express";
import { hasWorkspacePermission } from "../services/workspace-permissions";

export function requirePermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.workspaceContext;
    if (!context) {
      res.status(403).json({
        error: {
          code: "WORKSPACE_CONTEXT_REQUIRED",
          message: "Workspace context is required."
        }
      });
      return;
    }

    try {
      if (!(await hasWorkspacePermission(context, permissionKey))) {
        res.status(403).json({
          error: {
            code: "PERMISSION_REQUIRED",
            message: "This permission is required."
          }
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
