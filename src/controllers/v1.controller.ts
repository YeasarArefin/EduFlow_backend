import type { RequestHandler } from "express";

export const getApiInfo: RequestHandler = (_req, res) => {
  res.status(200).json({
    data: {
      name: "EduFlow API",
      version: "v1",
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
  res.status(200).json({
    data: req.workspaceContext,
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
