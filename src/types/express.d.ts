import type { WorkspaceContext } from "./workspace-context";

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: {
        id: string;
      };
      workspaceContext?: WorkspaceContext;
    }
  }
}

export {};
