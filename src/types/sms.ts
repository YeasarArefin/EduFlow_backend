export type SmsEncoding = 'gsm-7' | 'unicode';
export type SmsSegmentPreview = { characters: number; encoding: SmsEncoding; segmentsPerRecipient: number; recipientCount: number; totalCredits: number };
export type SmsSendResult = { success: true; providerMessageId: string } | { success: false; errorCode: string; message: string };
export interface SmsProvider { send(input: { to: string; message: string }): Promise<SmsSendResult>; }
