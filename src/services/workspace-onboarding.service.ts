import { db } from "../database/client";
import { workspaceRoleCodes } from "../database/schema/roles";
import { workspaceMembers, workspaces, workspaceSettings } from "../database/schema/workspaces";
import { AppError } from "../middleware/error-handler";

export type CreateWorkspaceOnboardingInput = {
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: string;
};

export async function createWorkspaceOnboarding(
  createdByUserId: string,
  input: CreateWorkspaceOnboardingInput
) {
  try {
    return await db.transaction(async (transaction) => {
      const [workspace] = await transaction
        .insert(workspaces)
        .values({
          name: input.name,
          slug: input.slug,
          phone: input.phone,
          email: input.email,
          address: input.address,
          createdByUserId,
          status: "pending"
        })
        .returning({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          phone: workspaces.phone,
          email: workspaces.email,
          address: workspaces.address,
          status: workspaces.status,
          createdAt: workspaces.createdAt
        });

      await transaction.insert(workspaceSettings).values({ workspaceId: workspace.id });
      await transaction.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: createdByUserId,
        roleCode: workspaceRoleCodes.owner,
        joinedAt: new Date()
      });

      return workspace;
    });
  } catch (error) {
    const databaseError =
      error && typeof error === "object" ? (error as { code?: string; cause?: { code?: string } }) : undefined;
    const databaseErrorCode = databaseError?.code ?? databaseError?.cause?.code;

    if (databaseErrorCode === "23505") {
      throw new AppError("WORKSPACE_SLUG_ALREADY_EXISTS", "This workspace slug is already in use.", 409);
    }

    throw error;
  }
}
