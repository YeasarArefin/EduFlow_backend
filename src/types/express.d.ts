import type { AuthenticatedUser } from './auth';
import type { WorkspaceContext } from './workspace';

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
      workspaceContext?: WorkspaceContext;
    }
  }
}

export {};
