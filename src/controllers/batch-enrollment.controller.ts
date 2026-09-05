import type { RequestHandler } from "express";
import {
  archiveEnrollment,
  enrollStudent,
  listBatchEnrollments,
  updateEnrollment,
} from "../services/batch-enrollment.service";
import {
  enrollmentParamsSchema,
  enrollStudentSchema,
  updateEnrollmentSchema,
} from "../validation/batch-enrollment.validation";

const invalid = (res: Parameters<RequestHandler>[1]) =>
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed." } });

export const listBatchEnrollmentsController: RequestHandler = async (req, res, next) => {
  const p = enrollmentParamsSchema.safeParse({ batchId: req.params.id });
  if (!p.success) return invalid(res);
  try {
    res.json({ data: await listBatchEnrollments(req.workspaceContext!.workspaceId, p.data.batchId) });
  } catch (e) {
    next(e);
  }
};

export const enrollStudentController: RequestHandler = async (req, res, next) => {
  const p = enrollmentParamsSchema.safeParse({ batchId: req.params.id }),
    i = enrollStudentSchema.safeParse(req.body);
  if (!p.success || !i.success) return invalid(res);
  try {
    res
      .status(201)
      .json({
        data: await enrollStudent(
          req.workspaceContext!.workspaceId,
          req.authenticatedUser!.id,
          p.data.batchId,
          i.data,
        ),
      });
  } catch (e) {
    next(e);
  }
};

export const updateEnrollmentController: RequestHandler = async (req, res, next) => {
  const p = enrollmentParamsSchema.safeParse({
      batchId: req.params.id,
      enrollmentId: req.params.enrollmentId,
    }),
    i = updateEnrollmentSchema.safeParse(req.body);
  if (!p.success || !i.success) return invalid(res);
  try {
    res.json({
      data: await updateEnrollment(
        req.workspaceContext!.workspaceId,
        req.authenticatedUser!.id,
        p.data.batchId,
        p.data.enrollmentId!,
        i.data,
      ),
    });
  } catch (e) {
    next(e);
  }
};

export const archiveEnrollmentController: RequestHandler = async (req, res, next) => {
  const p = enrollmentParamsSchema.safeParse({
    batchId: req.params.id,
    enrollmentId: req.params.enrollmentId,
  });
  if (!p.success) return invalid(res);
  try {
    res.json({
      data: await archiveEnrollment(
        req.workspaceContext!.workspaceId,
        req.authenticatedUser!.id,
        p.data.batchId,
        p.data.enrollmentId!,
      ),
    });
  } catch (e) {
    next(e);
  }
};

export const deleteEnrollmentController = archiveEnrollmentController;
