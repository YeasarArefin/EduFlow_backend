import type { RequestHandler } from "express";
import {
  createWorkspaceEntitlementOverride,
  listWorkspaceEntitlementOverrides,
  removeWorkspaceEntitlementOverride,
  updateWorkspaceEntitlementOverride
} from "../services/workspace-entitlement-override.service";
import {
  entitlementOverrideIdSchema,
  entitlementOverridePatchSchema,
  entitlementOverrideSchema
} from "../validation/entitlement-override.validation";
import { workspaceIdSchema } from "../validation/workspace.validation";
function ids(req: Parameters<RequestHandler>[0]) {
  const workspaceId = workspaceIdSchema.safeParse(req.params.workspaceId);
  const id =
    req.params.id === undefined
      ? { success: true as const, data: undefined }
      : entitlementOverrideIdSchema.safeParse(req.params.id);
  return { workspaceId, id };
}
export const listPlatformOverrides: RequestHandler = async (req, res, next) => {
  const { workspaceId } = ids(req);
  if (!workspaceId.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "A valid workspace ID is required."
      }
    });
    return;
  }
  try {
    res.status(200).json({
      data: await listWorkspaceEntitlementOverrides(workspaceId.data)
    });
  } catch (error) {
    next(error);
  }
};
export const createPlatformOverride: RequestHandler = async (req, res, next) => {
  const { workspaceId } = ids(req);
  const parsed = entitlementOverrideSchema.safeParse(req.body);
  if (!workspaceId.success || !parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      }
    });
    return;
  }
  try {
    res.status(201).json({
      data: await createWorkspaceEntitlementOverride(workspaceId.data, {
        ...parsed.data,
        limitOverride: parsed.data.limitOverride
      }, req.authenticatedUser!.id)
    });
  } catch (error) {
    next(error);
  }
};
export const updatePlatformOverride: RequestHandler = async (req, res, next) => {
  const { workspaceId, id } = ids(req);
  const parsed = entitlementOverridePatchSchema.safeParse(req.body);
  if (!workspaceId.success || !id.success || !id.data || !parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      }
    });
    return;
  }
  try {
    res.status(200).json({
      data: await updateWorkspaceEntitlementOverride(workspaceId.data, id.data, parsed.data, req.authenticatedUser!.id)
    });
  } catch (error) {
    next(error);
  }
};
export const removePlatformOverride: RequestHandler = async (req, res, next) => {
  const { workspaceId, id } = ids(req);
  if (!workspaceId.success || !id.success || !id.data) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "A valid workspace and override ID are required."
      }
    });
    return;
  }
  try {
    await removeWorkspaceEntitlementOverride(workspaceId.data, id.data, req.authenticatedUser!.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
