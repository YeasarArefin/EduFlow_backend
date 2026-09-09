export type SubscriptionAccessStatus =
  | 'verification_pending'
  | 'payment_pending'
  | 'trial'
  | 'active'
  | 'renewal_due'
  | 'subscription_expired'
  | 'locked'
  | 'scheduled_for_deletion'
  | 'suspended';

export type SubscriptionLifecycleTransition =
  'renewal_due' | 'expired' | 'locked' | 'unlocked' | 'scheduled_deletion';

export type SubscriptionAccessState = {
  allowed: boolean;
  status: SubscriptionAccessStatus;
  reason: string;
};

export type SubscriptionAccessInput = {
  workspaceStatus: 'pending' | 'active' | 'locked' | 'suspended' | 'scheduled_deletion' | 'deleted';
  subscription: {
    status: 'trial' | 'pending' | 'active' | 'renewal_due' | 'expired' | 'cancelled' | 'suspended';
    startsAt: Date | null;
    expiresAt: Date | null;
    trialEndsAt: Date | null;
  } | null;
  now?: Date;
};

export type PlanFeatureInput = { featureKey: string; enabled: boolean; limitValue: bigint | null };
export type PlanInput = { name: string; slug: string; priceMinor: bigint; durationDays: number; trialDays: number; isActive?: boolean; features?: PlanFeatureInput[] };
export type PublicPlan = { id: string; name: string; slug: string; priceMinor: string; durationDays: number; trial: { included: boolean; days: number }; features: Array<{ key: string; name: string; description: string | null; defaultLimit: string | null }>; quotas: Record<string, string | null> };
