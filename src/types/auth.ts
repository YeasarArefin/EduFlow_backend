export interface AuthenticatedUser {
  id: string;
}

export type AccountRoute = 'dashboard' | 'workspace_creation' | 'payment_pending' | 'account';
