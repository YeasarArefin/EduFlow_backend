export const smsTemplateVariables = [
  'student_name',
  'guardian_name',
  'batch_name',
  'amount',
  'due_date',
  'workspace_name',
] as const;
export type SmsTemplateVariable = (typeof smsTemplateVariables)[number];
export type SmsTemplateValues = Partial<Record<SmsTemplateVariable, string>>;
