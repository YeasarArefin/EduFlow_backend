import { Router } from "express";
import {
  approvePayment,
  createPaymentRequest,
  listPendingPayments,
  rejectPayment
} from "../../controllers/payment.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePlatformOwner } from "../../middleware/require-platform-owner";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const paymentRoutes = Router();
paymentRoutes.post("/", requireAuth, requireWorkspaceContext, createPaymentRequest);
paymentRoutes.get("/pending", requireAuth, requirePlatformOwner, listPendingPayments);
paymentRoutes.post("/:id/approve", requireAuth, requirePlatformOwner, approvePayment);
paymentRoutes.post("/:id/reject", requireAuth, requirePlatformOwner, rejectPayment);
