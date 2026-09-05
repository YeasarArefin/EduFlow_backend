import type { RequestHandler } from "express";
import { archiveBatch, createBatch, getBatch, listBatches, updateBatch } from "../services/batch.service";
import { batchIdSchema, createBatchSchema, listBatchesQuerySchema, updateBatchSchema } from "../validation/batch.validation";

const validationError = (res: Parameters<RequestHandler>[1]) => res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } });

export const createBatchController: RequestHandler = async (req, res, next) => {
  const input = createBatchSchema.safeParse(req.body);
  if (!input.success) return validationError(res);
  try { res.status(201).json({ data: await createBatch(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, input.data) }); } catch (error) { next(error); }
};
export const listBatchesController: RequestHandler = async (req, res, next) => {
  const input = listBatchesQuerySchema.safeParse(req.query);
  if (!input.success) return validationError(res);
  try { res.json(await listBatches(req.workspaceContext!.workspaceId, input.data)); } catch (error) { next(error); }
};
export const getBatchController: RequestHandler = async (req, res, next) => {
  const id = batchIdSchema.safeParse(req.params.id);
  if (!id.success) return validationError(res);
  try { res.json({ data: await getBatch(req.workspaceContext!.workspaceId, id.data) }); } catch (error) { next(error); }
};
export const updateBatchController: RequestHandler = async (req, res, next) => {
  const id = batchIdSchema.safeParse(req.params.id), input = updateBatchSchema.safeParse(req.body);
  if (!id.success || !input.success) return validationError(res);
  try { res.json({ data: await updateBatch(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, id.data, input.data) }); } catch (error) { next(error); }
};
export const archiveBatchController: RequestHandler = async (req, res, next) => {
  const id = batchIdSchema.safeParse(req.params.id);
  if (!id.success) return validationError(res);
  try { res.json({ data: await archiveBatch(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, id.data) }); } catch (error) { next(error); }
};
