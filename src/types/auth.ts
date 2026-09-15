export interface AuthenticatedUser {
  id: string;
  sessionId: string;
}

export type AccountRoute = 'dashboard' | 'workspace_creation' | 'payment_pending' | 'account';
