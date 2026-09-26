import { and, desc, eq } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { smsTemplates } from '../database/schema/sms-templates';
import { AppError } from '../middleware/error-handler';
import { smsTemplateVariables, type SmsTemplateValues } from '../types/sms-template';

const variablePattern = /{{\s*([a-z_]+)\s*}}/g;
export function validateSmsTemplateVariables(body: string) {
  const invalid = [...body.matchAll(variablePattern)]
    .map((match) => match[1])
    .filter(
      (variable) =>
        !smsTemplateVariables.includes(variable as (typeof smsTemplateVariables)[number])
    );
  if (invalid.length)
    throw new AppError(
      'UNSUPPORTED_SMS_TEMPLATE_VARIABLE',
      `Unsupported SMS template variable: {{${invalid[0]}}}.`,
      400
    );
}
export function renderSmsTemplate(body: string, values: SmsTemplateValues = {}) {
  validateSmsTemplateVariables(body);
  return body.replace(
    variablePattern,
    (_, variable: string) => values[variable as keyof SmsTemplateValues] ?? ''
  );
}
export async function listSmsTemplates(workspaceId: string) {
  return withWorkspaceContext(workspaceId, async (tx) =>
    (
      await tx
        .select()
        .from(smsTemplates)
        .where(eq(smsTemplates.workspaceId, workspaceId))
        .orderBy(desc(smsTemplates.updatedAt))
    ).map((item) => ({ ...item }))
  );
}
export async function createSmsTemplate(
  workspaceId: string,
  input: Omit<typeof smsTemplates.$inferInsert, 'workspaceId'>
) {
  validateSmsTemplateVariables(input.body);
  return withWorkspaceContext(
    workspaceId,
    async (tx) =>
      (
        await tx
          .insert(smsTemplates)
          .values({ ...input, workspaceId })
          .returning()
      )[0]
  );
}
export async function updateSmsTemplate(
  workspaceId: string,
  id: string,
  input: Partial<typeof smsTemplates.$inferInsert>
) {
  if (input.body) validateSmsTemplateVariables(input.body);
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [template] = await tx
      .update(smsTemplates)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(smsTemplates.workspaceId, workspaceId), eq(smsTemplates.id, id)))
      .returning();
    if (!template) throw new AppError('SMS_TEMPLATE_NOT_FOUND', 'SMS template was not found.', 404);
    return template;
  });
}
