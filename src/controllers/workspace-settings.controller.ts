import type { RequestHandler } from 'express';
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from '../services/workspace-settings.service';
import { updateWorkspaceSettingsSchema } from '../validation/workspace-settings.validation';
export const getWorkspaceSettingsController: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await getWorkspaceSettings(req.workspaceContext!.workspaceId) });
  } catch (error) {
    next(error);
  }
};
export const updateWorkspaceSettingsController: RequestHandler = async (req, res, next) => {
  const input = updateWorkspaceSettingsSchema.safeParse(req.body);
  if (!input.success) {
    res
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.' } });
    return;
  }
  try {
    res.json({
      data: await updateWorkspaceSettings(
        req.workspaceContext!.workspaceId,
        req.authenticatedUser!.id,
        input.data
      ),
    });
  } catch (error) {
    next(error);
  }
};
