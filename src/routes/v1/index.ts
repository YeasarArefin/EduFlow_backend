import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import { requireFeatureEntitlement } from "../../middleware/require-feature-entitlement";
import {
  getApiInfo,
  getAuthContext,
  getPermissionGuardExample,
  getWorkspaceContext,
  getAccessPipelineExample,
} from "../../controllers/v1.controller";

export const v1Router = Router();

v1Router.get("/", getApiInfo);

v1Router.get("/auth-context", requireAuth, getAuthContext);

v1Router.get("/workspace-context", requireAuth, requireWorkspaceContext, getWorkspaceContext);

v1Router.get("/permission-guard-example", requireAuth, requireWorkspaceContext, requirePermission("students.view"), getPermissionGuardExample);

v1Router.get(
  "/access-pipeline-example",
  requireAuth,
  requireWorkspaceContext,
  requireWorkspaceSubscriptionAccess,
  requireFeatureEntitlement("students"),
  requirePermission("students.view"),
  getAccessPipelineExample,
);
