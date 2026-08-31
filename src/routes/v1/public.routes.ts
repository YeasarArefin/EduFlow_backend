import { Router } from "express";
import { listPublicPlans } from "../../controllers/plan.controller";

export const publicRoutes = Router();
publicRoutes.get("/plans", listPublicPlans);
