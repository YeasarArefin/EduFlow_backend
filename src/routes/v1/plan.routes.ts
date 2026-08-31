import { Router } from "express";
import {
  activatePlatformPlan,
  createPlatformPlan,
  deactivatePlatformPlan,
  listPlatformPlans,
  updatePlatformPlan
} from "../../controllers/plan.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePlatformOwner } from "../../middleware/require-platform-owner";

export const planRoutes = Router();
planRoutes.use(requireAuth, requirePlatformOwner);
planRoutes.get("/", listPlatformPlans);
planRoutes.post("/", createPlatformPlan);
planRoutes.patch("/:id", updatePlatformPlan);
planRoutes.post("/:id/activate", activatePlatformPlan);
planRoutes.post("/:id/deactivate", deactivatePlatformPlan);
