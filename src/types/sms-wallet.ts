import type { z } from 'zod';
import type { smsWalletHistoryQuerySchema } from '../validation/sms-wallet.validation';

export type SmsWalletHistoryQuery = z.infer<typeof smsWalletHistoryQuerySchema>;

export type SmsWalletCreditInput = {
  amount: bigint;
  actorUserId?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  reason?: string;
};
