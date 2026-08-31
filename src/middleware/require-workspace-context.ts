import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "../database/client";
import { workspaceMembers } from "../database/schema/workspaces";
import { workspaceIdSchema } from "../validation/workspace.validation";

export async function requireWorkspaceContext(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  const workspaceIdResult = workspaceIdSchema.safeParse(req.header("x-workspace-id"));
  if (!workspaceIdResult.success) {
    res.status(400).json({
      error: {
        code: "INVALID_WORKSPACE_ID",
        message: "A valid X-Workspace-Id header is required."
      }
    });
    return;
  }

  try {
    const [membership] = await db
      .select({
        membershipId: workspaceMembers.id,
        workspaceId: workspaceMembers.workspaceId,
        roleCode: workspaceMembers.roleCode
      })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceIdResult.data), eq(workspaceMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      res.status(403).json({
        error: {
          code: "WORKSPACE_MEMBERSHIP_REQUIRED",
          message: "You are not a member of this workspace."
        }
      });
      return;
    }

    req.workspaceContext = membership;
    next();
  } catch (error) {
    next(error);
  }
}
