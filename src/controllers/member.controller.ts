import type { RequestHandler } from "express";
import { addMember, listMembers, removeMember, updateMemberRole, updateMemberStatus } from "../services/member.service";
import { createMemberSchema, listMembersQuerySchema, memberIdSchema, updateMemberRoleSchema, updateMemberStatusSchema } from "../validation/member.validation";

const invalid = (res: Parameters<RequestHandler>[1]) => res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } });

export const listMembersController: RequestHandler = async (req, res, next) => {
  const input = listMembersQuerySchema.safeParse(req.query);
  if (!input.success) return invalid(res);
  try { res.json(await listMembers(req.workspaceContext!.workspaceId, input.data)); } catch (error) { next(error); }
};
export const addMemberController: RequestHandler = async (req, res, next) => {
  const input = createMemberSchema.safeParse(req.body);
  if (!input.success) return invalid(res);
  try { res.status(201).json({ data: await addMember(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, input.data) }); } catch (error) { next(error); }
};
export const updateMemberRoleController: RequestHandler = async (req, res, next) => {
  const id = memberIdSchema.safeParse(req.params.id), input = updateMemberRoleSchema.safeParse(req.body);
  if (!id.success || !input.success) return invalid(res);
  try { res.json({ data: await updateMemberRole(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, id.data, input.data) }); } catch (error) { next(error); }
};
export const updateMemberStatusController: RequestHandler = async (req, res, next) => {
  const id = memberIdSchema.safeParse(req.params.id), input = updateMemberStatusSchema.safeParse(req.body);
  if (!id.success || !input.success) return invalid(res);
  try { res.json({ data: await updateMemberStatus(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, id.data, input.data) }); } catch (error) { next(error); }
};
export const removeMemberController: RequestHandler = async (req, res, next) => {
  const id = memberIdSchema.safeParse(req.params.id);
  if (!id.success) return invalid(res);
  try { res.json({ data: await removeMember(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, id.data) }); } catch (error) { next(error); }
};
