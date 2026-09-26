import type { SmsProvider, SmsSendResult } from '../types/sms';

/** A vendor adapter can replace this contract later without changing the queue. */
export class UnconfiguredSmsProvider implements SmsProvider {
  send(): Promise<SmsSendResult> {
    return Promise.resolve({
      success: false,
      errorCode: 'SMS_PROVIDER_NOT_CONFIGURED',
      message: 'SMS delivery is not configured yet.',
    });
  }
}

export const smsProvider: SmsProvider = new UnconfiguredSmsProvider();
