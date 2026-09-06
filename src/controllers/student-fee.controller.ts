import type { RequestHandler } from "express";
import { bulkGenerateFees, generateEnrollmentFee, listStudentFees } from "../services/student-fee.service";
import { feeEnrollmentParamsSchema, feeHistoryQuerySchema, feeListQuerySchema, feeStudentParamsSchema, generateFeeSchema } from "../validation/student-fee.validation";

export const generateEnrollmentFeeController: RequestHandler = async (req, res) => {
  const { enrollmentId } = feeEnrollmentParamsSchema.parse(req.params);
  const { feeMonth } = generateFeeSchema.parse(req.body);
  const result = await generateEnrollmentFee(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, enrollmentId, feeMonth);
  res.status(result.created ? 201 : 200).json({ data: result.fee });
};

export const bulkGenerateFeesController: RequestHandler = async (req, res) => {
  const { feeMonth } = generateFeeSchema.parse(req.body);
  res.json({ data: await bulkGenerateFees(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, feeMonth) });
};

export const listWorkspaceFeesController: RequestHandler = async (req, res) => {
  const query = feeListQuerySchema.parse(req.query);
  res.json(await listStudentFees(req.workspaceContext!.workspaceId, query));
};

export const studentFeeHistoryController: RequestHandler = async (req, res) => {
  const { id } = feeStudentParamsSchema.parse(req.params);
  const query = feeHistoryQuerySchema.parse(req.query);
  res.json(await listStudentFees(req.workspaceContext!.workspaceId, query, id));
};
