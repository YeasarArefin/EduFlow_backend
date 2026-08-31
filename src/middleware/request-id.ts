import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // Express exposes request extension through namespace merging.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incomingRequestId = req.header("x-request-id");
  req.requestId = incomingRequestId?.trim() || randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
