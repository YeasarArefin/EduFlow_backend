import { Router } from "express";
import { getAccountState } from "../../controllers/account.controller";
import { requireAuth } from "../../middleware/require-auth";

export const accountRoutes = Router();
accountRoutes.get("/state", requireAuth, getAccountState);
