import { Router } from "express";
import { studentFeePermissions } from "../../config/student-fees";
import {
  getPaymentDetailController,
  getReceiptDetailController,
} from "../../controllers/student-payment.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const studentPaymentRoutes = Router();

studentPaymentRoutes.use(
  requireAuth,
  requireWorkspaceContext,
  requireWorkspaceSubscriptionAccess,
);

studentPaymentRoutes.get(
  "/receipts/:receiptNumber",
  requirePermission(studentFeePermissions.view.key),
  getReceiptDetailController,
);

studentPaymentRoutes.get(
  "/:id",
  requirePermission(studentFeePermissions.view.key),
  getPaymentDetailController,
);
