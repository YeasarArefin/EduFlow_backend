export interface WorkspaceContext {
  workspaceId: string;
  membershipId: string;
  roleCode: number;
  customRoleId: string | null;
}

export type CreateWorkspaceOnboardingInput = { name: string; slug: string; phone?: string; email?: string; address?: string };
export type WorkspaceOnboardingStep = 'workspace_created' | 'subscription_required' | 'payment_pending' | 'ready';
export type EntitlementOverrideInput = { featureKey: string; enabledOverride: boolean | null; limitOverride: bigint | null; reason: string; expiresAt: Date | null };
export type WorkspaceEntitlement = { enabled: boolean; limit: bigint | null };
export type CurrentSubscriptionStatus = 'trial' | 'pending' | 'active' | 'renewal_due';
export type EffectiveWorkspaceEntitlements = { workspaceId: string; subscription: { id: string; planId: string; status: CurrentSubscriptionStatus } | null; entitlements: Record<string, WorkspaceEntitlement> };
export type ListWorkspacesInput = { page: number; limit: number; search?: string; workspaceStatus?: 'pending' | 'active' | 'locked' | 'suspended' | 'scheduled_deletion' | 'deleted'; subscriptionStatus?: 'trial' | 'pending' | 'active' | 'renewal_due' | 'expired' | 'cancelled' | 'suspended'; accessStatus?: import('./subscription').SubscriptionAccessStatus; lifecycleQueue?: boolean };
