import { Router } from "express";
import { accountRoutes } from "./account.routes";
import { activityRoutes } from "./activity.routes";
import { coreRoutes } from "./core.routes";
import { paymentRoutes } from "./payment.routes";
import { planRoutes } from "./plan.routes";
import { publicRoutes } from "./public.routes";
import { workspaceRoutes } from "./workspace.routes";

export const v1Router = Router();

v1Router.use(coreRoutes);
v1Router.use("/account", accountRoutes);
v1Router.use("/activity", activityRoutes);
v1Router.use("/public", publicRoutes);
v1Router.use("/payment-requests", paymentRoutes);
v1Router.use("/plans", planRoutes);
v1Router.use("/workspaces", workspaceRoutes);
