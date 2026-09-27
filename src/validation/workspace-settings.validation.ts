import { z } from 'zod';

const bangladeshiMobileNumber = /^(?:\+8801\d{9}|01\d{9})$/;

export const updateWorkspaceSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    phone: z
      .string()
      .trim()
      .regex(
        bangladeshiMobileNumber,
        'Enter a valid Bangladeshi mobile number (for example, 01712345678).'
      )
      .nullable()
      .optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    address: z.string().trim().max(1000).nullable().optional(),
    defaultFeeDueDay: z.number().int().min(1).max(31).nullable().optional(),
    gracePeriodDays: z.number().int().min(0).max(365).optional(),
    receiptPrefix: z.string().trim().max(20).nullable().optional(),
    smsDefaultSenderId: z.string().trim().max(100).nullable().optional(),
    absenceEmailEnabled: z.boolean().optional(),
    absenceEmailRecipient: z.enum(['guardian', 'student', 'both']).optional(),
    absenceSmsEnabled: z.boolean().optional(),
    noticeEmailEnabled: z.boolean().optional(),
    noticeSmsEnabled: z.boolean().optional(),
    noticeRecipient: z.enum(['guardian', 'student', 'both']).optional(),
    paymentSmsEnabled: z.boolean().optional(),
    reminderSmsEnabled: z.boolean().optional(),
    overdueSmsEnabled: z.boolean().optional(),
    paymentReminderDaysBefore: z.number().int().min(0).max(60).optional(),
    graceReminderDaysAfter: z.number().int().min(0).max(60).optional(),
    overdueWarningDaysAfter: z.number().int().min(0).max(60).optional(),
    paymentConfirmationEnabled: z.boolean().optional(),
    paymentReminderEnabled: z.boolean().optional(),
    graceReminderEnabled: z.boolean().optional(),
    overdueWarningEnabled: z.boolean().optional(),
  })
  .strict();
