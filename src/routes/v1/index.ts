import { Router } from "express";
import { coreRoutes } from "./core.routes";
import { paymentRoutes } from "./payment.routes";
import { planRoutes } from "./plan.routes";
import { workspaceRoutes } from "./workspace.routes";

export const v1Router = Router();

v1Router.use(coreRoutes);
v1Router.use("/payment-requests", paymentRoutes);
v1Router.use("/plans", planRoutes);
v1Router.use("/workspaces", workspaceRoutes);
