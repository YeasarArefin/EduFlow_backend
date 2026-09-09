import type { RequestHandler } from 'express';

export const getApiInfo: RequestHandler = (_req, res) => {
  res.status(200).json({
    data: {
      name: 'EduFlow API',
      version: 'v1',
    },
  });
};

export const getAuthContext: RequestHandler = (req, res) => {
  res.status(200).json({
    data: {
      userId: req.authenticatedUser!.id,
    },
  });
};

export const getWorkspaceContext: RequestHandler = (req, res) => {
  const { membershipId, workspaceId, roleCode } = req.workspaceContext!;
  res.status(200).json({
    data: { membershipId, workspaceId, roleCode },
  });
};

export const getPermissionGuardExample: RequestHandler = (req, res) => {
  res.status(200).json({
    data: {
      userId: req.authenticatedUser!.id,
      workspace: req.workspaceContext,
    },
  });
};

export const getAccessPipelineExample: RequestHandler = (req, res) => {
  res.status(200).json({
    data: {
      userId: req.authenticatedUser!.id,
      workspace: req.workspaceContext,
    },
  });
};
