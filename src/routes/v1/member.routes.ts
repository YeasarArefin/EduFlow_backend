import { Router } from "express";
import { addMemberController, listMembersController, removeMemberController, updateMemberRoleController, updateMemberStatusController } from "../../controllers/member.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const memberRoutes = Router();
memberRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess, requirePermission("members.manage"));
memberRoutes.get("/", listMembersController);
memberRoutes.post("/", addMemberController);
memberRoutes.patch("/:id/role", updateMemberRoleController);
memberRoutes.patch("/:id/status", updateMemberStatusController);
memberRoutes.delete("/:id", removeMemberController);
