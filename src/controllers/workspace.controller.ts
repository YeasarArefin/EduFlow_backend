import type { RequestHandler } from "express";
import { getWorkspaceDetail, listWorkspaces } from "../services/workspace-list.service";
import { workspaceIdSchema, workspaceListQuerySchema } from "../validation/workspace.validation";

export const listPlatformWorkspaces: RequestHandler = async (req, res, next) => {
  const parsed = workspaceListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      }
    });
    return;
  }
  try {
    const result = await listWorkspaces(parsed.data);
    res.status(200).json({
      data: result.data,
      meta: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / parsed.data.limit)
      }
    });
  } catch (error) {
    next(error);
  }
};
export const getPlatformWorkspaceDetail: RequestHandler = async (req, res, next) => {
  const parsed = workspaceIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "A valid workspace ID is required."
      }
    });
    return;
  }
  try {
    res.status(200).json({ data: await getWorkspaceDetail(parsed.data) });
  } catch (error) {
    next(error);
  }
};
