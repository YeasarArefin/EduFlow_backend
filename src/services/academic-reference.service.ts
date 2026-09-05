import { and, asc, eq } from "drizzle-orm";
import { academicGroups, classLevels, mediums } from "../database/schema/academics";
import { withWorkspaceContext } from "../database/client";
import { AppError } from "../middleware/error-handler";
import type { z } from "zod";
import type { academicResourceSchema, createAcademicReferenceSchema } from "../validation/academic.validation";

type Resource = z.infer<typeof academicResourceSchema>;
type Input = z.infer<typeof createAcademicReferenceSchema>;
const tables = { "class-levels": classLevels, mediums, "academic-groups": academicGroups } as const;
function tableFor(resource: Resource) { return tables[resource]; }
function duplicate(error: unknown): never { if ((error as { code?: string })?.code === "23505") throw new AppError("ACADEMIC_REFERENCE_ALREADY_EXISTS", "This name already exists in the workspace.", 409); throw error; }
export async function listAcademicReferences(workspaceId: string, resource: Resource) { const table = tableFor(resource); return withWorkspaceContext(workspaceId, (tx) => tx.select().from(table).where(eq(table.workspaceId, workspaceId)).orderBy(asc(table.name))); }
export async function createAcademicReference(workspaceId: string, resource: Resource, input: Input) { const table = tableFor(resource); try { return await withWorkspaceContext(workspaceId, async (tx) => { const [row] = await tx.insert(table).values({ workspaceId, name: input.name }).returning(); return row; }); } catch (error) { return duplicate(error); } }
export async function renameAcademicReference(workspaceId: string, resource: Resource, id: string, input: Input) { const table = tableFor(resource); try { return await withWorkspaceContext(workspaceId, async (tx) => { const [row] = await tx.update(table).set({ name: input.name }).where(and(eq(table.id, id), eq(table.workspaceId, workspaceId))).returning(); if (!row) throw new AppError("ACADEMIC_REFERENCE_NOT_FOUND", "The academic reference was not found.", 404); return row; }); } catch (error) { return duplicate(error); } }
export async function updateAcademicReferenceStatus(workspaceId: string, resource: Resource, id: string, isActive: boolean) { const table = tableFor(resource); return withWorkspaceContext(workspaceId, async (tx) => { const [row] = await tx.update(table).set({ isActive }).where(and(eq(table.id, id), eq(table.workspaceId, workspaceId))).returning(); if (!row) throw new AppError("ACADEMIC_REFERENCE_NOT_FOUND", "The academic reference was not found.", 404); return row; }); }
