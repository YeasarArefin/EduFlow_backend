import { Router } from "express";
import { getPlatformWorkspaceDetail, listPlatformWorkspaces } from "../../controllers/workspace.controller";
import {
  createPlatformOverride,
  listPlatformOverrides,
  removePlatformOverride,
  updatePlatformOverride
} from "../../controllers/workspace-entitlement-override.controller";
import { runPlatformSubscriptionOperation } from "../../controllers/subscription-operation.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePlatformOwner } from "../../middleware/require-platform-owner";

export const workspaceRoutes = Router();
workspaceRoutes.use(requireAuth, requirePlatformOwner);
workspaceRoutes.get("/", listPlatformWorkspaces);
workspaceRoutes.get("/:id", getPlatformWorkspaceDetail);
workspaceRoutes.get("/:workspaceId/entitlement-overrides", listPlatformOverrides);
workspaceRoutes.post("/:workspaceId/entitlement-overrides", createPlatformOverride);
workspaceRoutes.patch("/:workspaceId/entitlement-overrides/:id", updatePlatformOverride);
workspaceRoutes.delete("/:workspaceId/entitlement-overrides/:id", removePlatformOverride);
workspaceRoutes.post("/:workspaceId/subscription-operations/:operation", runPlatformSubscriptionOperation);
