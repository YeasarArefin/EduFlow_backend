import type { RequestHandler } from "express";
import { listPlatformActivity } from "../services/audit-log.service";
import { activityQuerySchema } from "../validation/audit-log.validation";

export const listActivity: RequestHandler = async (req, res, next) => {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } });
    return;
  }
  try {
    res.status(200).json(await listPlatformActivity(parsed.data));
  } catch (error) {
    next(error);
  }
};
