import type { RequestHandler } from 'express';
import {
  createAttendanceSession,
  finalizeAttendanceSession,
  getAttendanceSession,
  listAttendanceSessions,
  saveAttendance,
} from '../services/attendance.service';
import {
  attendanceSessionParamsSchema,
  bulkSaveAttendanceSchema,
  createAttendanceSessionSchema,
  listAttendanceSessionsQuerySchema,
} from '../validation/attendance.validation';

export const createAttendanceSessionController: RequestHandler = async (req, res) => {
  const input = createAttendanceSessionSchema.parse(req.body);
  res.status(201).json({
    data: await createAttendanceSession(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      input
    ),
  });
};

export const getAttendanceSessionController: RequestHandler = async (req, res) => {
  const { id } = attendanceSessionParamsSchema.parse(req.params);
  res.json({ data: await getAttendanceSession(req.workspaceContext!.workspaceId, id) });
};

export const listAttendanceSessionsController: RequestHandler = async (req, res) => {
  const query = listAttendanceSessionsQuerySchema.parse(req.query);
  res.json(await listAttendanceSessions(req.workspaceContext!.workspaceId, query));
};

export const saveAttendanceController: RequestHandler = async (req, res) => {
  const { id } = attendanceSessionParamsSchema.parse(req.params);
  const input = bulkSaveAttendanceSchema.parse(req.body);
  res.json({
    data: await saveAttendance(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      id,
      input
    ),
  });
};

export const finalizeAttendanceSessionController: RequestHandler = async (req, res) => {
  const { id } = attendanceSessionParamsSchema.parse(req.params);
  res.json({
    data: await finalizeAttendanceSession(
      req.workspaceContext!.workspaceId,
      req.authenticatedUser!.id,
      id
    ),
  });
};
