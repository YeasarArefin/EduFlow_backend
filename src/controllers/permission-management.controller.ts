import type { RequestHandler } from 'express';
import {
  createWorkspaceRole,
  deleteWorkspaceRole,
  getMemberPermissionOverrides,
  getPermissionConfiguration,
  resetMemberPermissionOverrides,
  updateMemberPermissionOverrides,
  updateWorkspaceRole,
} from '../services/permission-management.service';
import {
  createRoleSchema,
  permissionMemberIdSchema,
  permissionRoleIdSchema,
  updateMemberOverridesSchema,
  updateRoleSchema,
} from '../validation/permission-management.validation';

const invalid = (res: Parameters<RequestHandler>[1]) =>
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.' },
  });

export const getPermissionConfigurationController: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await getPermissionConfiguration(req.workspaceContext!.workspaceId) });
  } catch (error) {
    next(error);
  }
};

export const createRoleController: RequestHandler = async (req, res, next) => {
  const input = createRoleSchema.safeParse(req.body);
  if (!input.success) return invalid(res);
  try {
    const data = await createWorkspaceRole(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      input.data
    );
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};

export const updateRoleController: RequestHandler = async (req, res, next) => {
  const roleId = permissionRoleIdSchema.safeParse(req.params.roleId);
  const input = updateRoleSchema.safeParse(req.body);
  if (!roleId.success || !input.success) return invalid(res);
  try {
    const data = await updateWorkspaceRole(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      roleId.data,
      input.data
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const deleteRoleController: RequestHandler = async (req, res, next) => {
  const roleId = permissionRoleIdSchema.safeParse(req.params.roleId);
  if (!roleId.success) return invalid(res);
  try {
    await deleteWorkspaceRole(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      roleId.data
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const getMemberPermissionOverridesController: RequestHandler = async (req, res, next) => {
  const memberId = permissionMemberIdSchema.safeParse(req.params.memberId);
  if (!memberId.success) return invalid(res);
  try {
    res.json({
      data: await getMemberPermissionOverrides(req.workspaceContext!.workspaceId, memberId.data),
    });
  } catch (error) {
    next(error);
  }
};

export const updateMemberPermissionOverridesController: RequestHandler = async (req, res, next) => {
  const memberId = permissionMemberIdSchema.safeParse(req.params.memberId);
  const input = updateMemberOverridesSchema.safeParse(req.body);
  if (!memberId.success || !input.success) return invalid(res);
  try {
    const data = await updateMemberPermissionOverrides(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      memberId.data,
      input.data
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const resetMemberPermissionOverridesController: RequestHandler = async (req, res, next) => {
  const memberId = permissionMemberIdSchema.safeParse(req.params.memberId);
  if (!memberId.success) return invalid(res);
  try {
    const data = await resetMemberPermissionOverrides(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      memberId.data
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
};
