import type { NextFunction, Request, Response } from 'express';
import { workspaceRoleCodes } from '../database/schema/roles';

export function requireWorkspaceOwner(req: Request, res: Response, next: NextFunction): void {
  if (req.workspaceContext?.roleCode !== workspaceRoleCodes.owner) {
    res
      .status(403)
      .json({
        error: {
          code: 'WORKSPACE_OWNER_REQUIRED',
          message: 'Only the workspace owner can perform this action.',
        },
      });
    return;
  }
  next();
}
