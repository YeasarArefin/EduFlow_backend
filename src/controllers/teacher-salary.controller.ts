import type { RequestHandler } from 'express';
import {
  bulkGenerateTeacherSalaries,
  generateTeacherSalary,
  listTeacherSalaries,
  listTeacherSalaryPayments,
  recordTeacherSalaryPayment,
} from '../services/teacher-salary.service';
import {
  generateTeacherSalarySchema,
  recordTeacherSalaryPaymentSchema,
  teacherSalaryListQuerySchema,
  teacherSalaryParamsSchema,
  teacherSalaryPaymentParamsSchema,
} from '../validation/teacher-salary.validation';
export const generateTeacherSalaryController: RequestHandler = async (req, res) => {
  const { teacherId } = teacherSalaryParamsSchema.parse(req.params);
  const { salaryMonth } = generateTeacherSalarySchema.parse(req.body);
  const result = await generateTeacherSalary(
    req.workspaceContext!.workspaceId,
    req.authenticatedUser!.id,
    teacherId,
    salaryMonth
  );
  res.status(result.created ? 201 : 200).json({ data: result.salary });
};
export const bulkGenerateTeacherSalariesController: RequestHandler = async (req, res) => {
  const { salaryMonth } = generateTeacherSalarySchema.parse(req.body);
  res.json({
    data: await bulkGenerateTeacherSalaries(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      salaryMonth
    ),
  });
};
export const listTeacherSalariesController: RequestHandler = async (req, res) => {
  res.json(
    await listTeacherSalaries(
      req.workspaceContext!.workspaceId,
      teacherSalaryListQuerySchema.parse(req.query)
    )
  );
};
export const teacherSalaryHistoryController: RequestHandler = async (req, res) => {
  const { teacherId } = teacherSalaryParamsSchema.parse(req.params);
  res.json(
    await listTeacherSalaries(
      req.workspaceContext!.workspaceId,
      teacherSalaryListQuerySchema.parse(req.query),
      teacherId
    )
  );
};
export const listTeacherSalaryPaymentsController: RequestHandler = async (req, res) => {
  const { id } = teacherSalaryPaymentParamsSchema.parse(req.params);
  res.json({ data: await listTeacherSalaryPayments(req.workspaceContext!.workspaceId, id) });
};
export const recordTeacherSalaryPaymentController: RequestHandler = async (req, res) => {
  const { id } = teacherSalaryPaymentParamsSchema.parse(req.params);
  const input = recordTeacherSalaryPaymentSchema.parse(req.body);
  const data = await recordTeacherSalaryPayment(
    req.workspaceContext!.workspaceId,
    req.authenticatedUser!.id,
    id,
    input
  );
  res.status(201).json({ data });
};
