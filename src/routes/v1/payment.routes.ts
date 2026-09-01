import { Router } from "express";
import {
  approvePayment,
  createAccountPaymentRequest,
  createPaymentRequest,
  getLatestAccountPayment,
  getLatestPayment,
  getRevenueOverview,
  listPendingPayments,
  rejectPayment
} from "../../controllers/payment.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePlatformOwner } from "../../middleware/require-platform-owner";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const paymentRoutes = Router();
paymentRoutes.post("/account", requireAuth, createAccountPaymentRequest);
paymentRoutes.get("/account/latest", requireAuth, getLatestAccountPayment);
paymentRoutes.post("/", requireAuth, requireWorkspaceContext, createPaymentRequest);
paymentRoutes.get("/latest", requireAuth, requireWorkspaceContext, getLatestPayment);
paymentRoutes.get("/pending", requireAuth, requirePlatformOwner, listPendingPayments);
paymentRoutes.get("/revenue-overview", requireAuth, requirePlatformOwner, getRevenueOverview);
paymentRoutes.post("/:id/approve", requireAuth, requirePlatformOwner, approvePayment);
paymentRoutes.post("/:id/reject", requireAuth, requirePlatformOwner, rejectPayment);
