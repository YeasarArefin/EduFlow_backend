import type { RequestHandler } from "express";
import { createPlan, listActivePublicPlans, listFeatureCatalog, listPlans, setPlanActive, updatePlan } from "../services/plan.service";
import { createPlanSchema, planIdSchema, updatePlanSchema } from "../validation/plan.validation";

export const listPlatformPlans: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listPlans() });
  } catch (error) {
    next(error);
  }
};
export const listPlatformFeatures: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listFeatureCatalog() });
  } catch (error) {
    next(error);
  }
};
export const listPublicPlans: RequestHandler = async (_req, res, next) => {
	try {
		res.status(200).json({ data: await listActivePublicPlans() });
	} catch (error) {
		next(error);
	}
};
export const createPlatformPlan: RequestHandler = async (req, res, next) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      }
    });
    return;
  }
  try {
    res.status(201).json({ data: await createPlan(parsed.data, req.authenticatedUser!.id) });
  } catch (error) {
    next(error);
  }
};
export const updatePlatformPlan: RequestHandler = async (req, res, next) => {
  const id = planIdSchema.safeParse(req.params.id);
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      }
    });
    return;
  }
  try {
    res.status(200).json({ data: await updatePlan(id.data, parsed.data, req.authenticatedUser!.id) });
  } catch (error) {
    next(error);
  }
};
export const activatePlatformPlan: RequestHandler = (req, res, next) => setPlanState(req, res, next, true);
export const deactivatePlatformPlan: RequestHandler = (req, res, next) => setPlanState(req, res, next, false);
async function setPlanState(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
  isActive: boolean
) {
  const id = planIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "A valid plan ID is required."
      }
    });
    return;
  }
  try {
    res.status(200).json({ data: await setPlanActive(id.data, isActive, req.authenticatedUser!.id) });
  } catch (error) {
    next(error);
  }
}
