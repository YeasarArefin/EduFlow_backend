import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { requireFeatureEntitlement } from "../../middleware/require-feature-entitlement";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import {
  getAccessPipelineExample,
  getApiInfo,
  getAuthContext,
  getPermissionGuardExample,
  getWorkspaceContext
} from "../../controllers/v1.controller";

export const coreRoutes = Router();
coreRoutes.get("/", getApiInfo);
coreRoutes.get("/auth-context", requireAuth, getAuthContext);
coreRoutes.get("/workspace-context", requireAuth, requireWorkspaceContext, getWorkspaceContext);
coreRoutes.get(
  "/permission-guard-example",
  requireAuth,
  requireWorkspaceContext,
  requirePermission("students.view"),
  getPermissionGuardExample
);
coreRoutes.get(
  "/access-pipeline-example",
  requireAuth,
  requireWorkspaceContext,
  requireWorkspaceSubscriptionAccess,
  requireFeatureEntitlement("students"),
  requirePermission("students.view"),
  getAccessPipelineExample
);
