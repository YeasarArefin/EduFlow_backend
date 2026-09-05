import { Router } from "express";
import { createAcademicReferenceController, listAcademicReferencesController, renameAcademicReferenceController, updateAcademicReferenceStatusController } from "../../controllers/academic-reference.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const academicRoutes = Router();
academicRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
academicRoutes.get("/:resource", requirePermission("students.view"), listAcademicReferencesController);
academicRoutes.post("/:resource", requirePermission("students.update"), createAcademicReferenceController);
academicRoutes.patch("/:resource/:id", requirePermission("students.update"), renameAcademicReferenceController);
academicRoutes.patch("/:resource/:id/status", requirePermission("students.update"), updateAcademicReferenceStatusController);
