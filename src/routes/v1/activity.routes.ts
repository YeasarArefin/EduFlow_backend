import { Router } from "express";
import { listActivity } from "../../controllers/activity.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePlatformOwner } from "../../middleware/require-platform-owner";

export const activityRoutes = Router();
activityRoutes.get("/", requireAuth, requirePlatformOwner, listActivity);
