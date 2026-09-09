import { eq } from 'drizzle-orm';
import { withWorkspaceContext } from '../database/client';
import { workspaceSettings, workspaces } from '../database/schema/workspaces';
import { recordAuditLog } from './audit-log.service';
import type { UpdateWorkspaceSettingsInput as Input } from '../types/common';
export async function getWorkspaceSettings(workspaceId: string) {
  return withWorkspaceContext(workspaceId, async (tx) => {
    const [workspace] = await tx
      .select({
        name: workspaces.name,
        phone: workspaces.phone,
        email: workspaces.email,
        address: workspaces.address,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    const [settings] = await tx
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    return { ...workspace, ...settings };
  });
}
export async function updateWorkspaceSettings(
  workspaceId: string,
  actorUserId: string,
  input: Input
) {
  await withWorkspaceContext(workspaceId, async (tx) => {
    const { name, phone, email, address, ...settings } = input;
    if (name !== undefined || phone !== undefined || email !== undefined || address !== undefined)
      await tx
        .update(workspaces)
        .set({
          ...(name !== undefined ? { name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(address !== undefined ? { address } : {}),
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));
    if (Object.keys(settings).length)
      await tx
        .update(workspaceSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(workspaceSettings.workspaceId, workspaceId));
    await recordAuditLog(tx, {
      actorUserId,
      action: 'workspace.settings_updated',
      entityType: 'workspace',
      entityId: workspaceId,
      workspaceId,
      metadata: { fields: Object.keys(input).join(',') },
    });
  });
  return getWorkspaceSettings(workspaceId);
}
