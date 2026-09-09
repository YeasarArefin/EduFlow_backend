export type CreateSubscriptionPaymentInput = { planId: string; amountMinor: bigint; paymentMethod: 'cash' | 'bkash' | 'nagad' | 'rocket' | 'other'; senderNumber: string; transactionId: string };
export type RevenueOverviewInput = { from?: Date; to?: Date };
