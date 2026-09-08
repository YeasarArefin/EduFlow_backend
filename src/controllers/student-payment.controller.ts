import type { RequestHandler } from "express";
import {
  getPaymentById,
  getPaymentByReceiptNumber,
  listFeePayments,
  listStudentPaymentHistory,
  recordStudentPayment,
} from "../services/student-payment.service";
import {
  feePaymentParamsSchema,
  receiptParamsSchema,
  recordStudentPaymentSchema,
  studentPaymentHistoryQuerySchema,
  studentPaymentParamsSchema,
} from "../validation/student-payment.validation";

export const recordFeePaymentController: RequestHandler = async (req, res) => {
  const { id: feeId } = feePaymentParamsSchema.parse(req.params);
  const input = recordStudentPaymentSchema.parse(req.body);
  const result = await recordStudentPayment(
    req.workspaceContext!.workspaceId,
    req.authenticatedUser!.id,
    feeId,
    input,
  );
  res.status(201).json({ data: result });
};

export const listFeePaymentsController: RequestHandler = async (req, res) => {
  const { id: feeId } = feePaymentParamsSchema.parse(req.params);
  const result = await listFeePayments(req.workspaceContext!.workspaceId, feeId);
  res.json(result);
};

export const listStudentPaymentsController: RequestHandler = async (req, res) => {
  const { id: studentId } = studentPaymentParamsSchema.parse(req.params);
  const query = studentPaymentHistoryQuerySchema.parse(req.query);
  const result = await listStudentPaymentHistory(
    req.workspaceContext!.workspaceId,
    studentId,
    query,
  );
  res.json(result);
};

export const getPaymentDetailController: RequestHandler = async (req, res) => {
  const { id: paymentId } = studentPaymentParamsSchema.parse(req.params);
  const result = await getPaymentById(req.workspaceContext!.workspaceId, paymentId);
  res.json(result);
};

export const getReceiptDetailController: RequestHandler = async (req, res) => {
  const { receiptNumber } = receiptParamsSchema.parse(req.params);
  const result = await getPaymentByReceiptNumber(
    req.workspaceContext!.workspaceId,
    receiptNumber,
  );
  res.json(result);
};
