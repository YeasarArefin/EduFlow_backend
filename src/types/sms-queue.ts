export type SmsRecipientTarget = 'student' | 'guardian' | 'both';
export type ResolvedSmsRecipient = {
  studentId: string | null;
  phone: string;
  recipientType: 'student' | 'guardian' | 'custom';
};
export type QueueSmsInput = {
  body: string;
  target: SmsRecipientTarget;
  studentIds?: string[];
  customNumbers?: string[];
  source?: string;
  actorUserId: string;
};
