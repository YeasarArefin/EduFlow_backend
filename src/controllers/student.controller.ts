import type { RequestHandler } from 'express';
import { listStudentEnrollments } from '../services/batch-enrollment.service';
import { csvTemplate, importCsv, previewCsvImport } from '../services/csv-import.service';
import { csvImportSchema } from '../validation/csv-import.validation';
import {
  archiveStudent,
  createStudent,
  getStudent,
  listStudents,
  updateStudent,
} from '../services/student.service';
import {
  createStudentSchema,
  listStudentsQuerySchema,
  studentIdSchema,
  updateStudentSchema,
} from '../validation/student.validation';

function validationError(res: Parameters<RequestHandler>[1]) {
  res
    .status(400)
    .json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.' } });
}

export const createStudentController: RequestHandler = async (req, res, next) => {
  const parsed = createStudentSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res);
  try {
    res.status(201).json({
      data: await createStudent(
        req.workspaceContext!.workspaceId,
        req.authenticatedUser!.id,
        parsed.data
      ),
    });
  } catch (error) {
    next(error);
  }
};
export const listStudentsController: RequestHandler = async (req, res, next) => {
  const parsed = listStudentsQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationError(res);
  try {
    const result = await listStudents(req.workspaceContext!.workspaceId, parsed.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
export const getStudentController: RequestHandler = async (req, res, next) => {
  const id = studentIdSchema.safeParse(req.params.id);
  if (!id.success) return validationError(res);
  try {
    res.status(200).json({ data: await getStudent(req.workspaceContext!.workspaceId, id.data) });
  } catch (error) {
    next(error);
  }
};
export const listStudentEnrollmentsController: RequestHandler = async (req, res, next) => {
  const id = studentIdSchema.safeParse(req.params.id);
  if (!id.success) return validationError(res);
  try {
    res
      .status(200)
      .json({ data: await listStudentEnrollments(req.workspaceContext!.workspaceId, id.data) });
  } catch (error) {
    next(error);
  }
};
export const updateStudentController: RequestHandler = async (req, res, next) => {
  const id = studentIdSchema.safeParse(req.params.id);
  const parsed = updateStudentSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return validationError(res);
  try {
    res
      .status(200)
      .json({ data: await updateStudent(req.workspaceContext!.workspaceId, id.data, parsed.data) });
  } catch (error) {
    next(error);
  }
};
export const archiveStudentController: RequestHandler = async (req, res, next) => {
  const id = studentIdSchema.safeParse(req.params.id);
  if (!id.success) return validationError(res);
  try {
    res.status(200).json({
      data: await archiveStudent(
        req.workspaceContext!.workspaceId,
        req.authenticatedUser!.id,
        id.data
      ),
    });
  } catch (error) {
    next(error);
  }
};
export const studentImportTemplateController: RequestHandler = (_req, res) => res.type('text/csv').send(csvTemplate('students'));
export const previewStudentImportController: RequestHandler = async (req, res, next) => { const input = csvImportSchema.safeParse(req.body); if (!input.success) return validationError(res); try { res.json({ data: await previewCsvImport(req.workspaceContext!.workspaceId, 'students', input.data.csv) }); } catch (error) { next(error); } };
export const importStudentsController: RequestHandler = async (req, res, next) => { const input = csvImportSchema.safeParse(req.body); if (!input.success) return validationError(res); try { res.status(201).json({ data: await importCsv(req.workspaceContext!.workspaceId, req.authenticatedUser!.id, 'students', input.data.csv) }); } catch (error) { next(error); } };
