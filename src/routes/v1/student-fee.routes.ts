import { Router } from "express";
import rateLimit from "express-rate-limit";
import { studentFeePermissions } from "../../config/student-fees";
import { bulkGenerateFeesController, generateEnrollmentFeeController, listWorkspaceFeesController } from "../../controllers/student-fee.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const studentFeeRoutes = Router();
studentFeeRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
const generationLimit = rateLimit({
  windowMs: 60_000, limit: 60,
  keyGenerator: (req) => req.workspaceContext!.workspaceId,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: { code: "FEE_GENERATION_RATE_LIMITED", message: "Too many fee generation requests. Please retry shortly." } },
});
studentFeeRoutes.get("/", requirePermission(studentFeePermissions.view.key), listWorkspaceFeesController);
studentFeeRoutes.post("/generate", requirePermission(studentFeePermissions.generate.key), generationLimit, bulkGenerateFeesController);
studentFeeRoutes.post("/enrollments/:enrollmentId/generate", requirePermission(studentFeePermissions.generate.key), generationLimit, generateEnrollmentFeeController);
