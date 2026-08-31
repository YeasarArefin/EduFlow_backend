import type { RequestHandler } from "express";
import {
  transitionSubscriptionLifecycle,
  type SubscriptionLifecycleTransition
} from "../services/subscription-lifecycle.service";
import {
  scheduleDeletionSchema,
  subscriptionOperationSchema,
  subscriptionOperationWorkspaceIdSchema
} from "../validation/subscription-operation.validation";

export const runPlatformSubscriptionOperation: RequestHandler = async (req, res, next) => {
  const workspaceId = subscriptionOperationWorkspaceIdSchema.safeParse(req.params.workspaceId);
  const operation = subscriptionOperationSchema.safeParse(req.params.operation);
  if (!workspaceId.success || !operation.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "A valid workspace and operation are required."
      }
    });
    return;
  }
  const schedule =
    operation.data === "schedule-deletion"
      ? scheduleDeletionSchema.safeParse(req.body)
      : { success: true as const, data: {} };
  if (!schedule.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "A future scheduled deletion date is required."
      }
    });
    return;
  }
  const transitions: Record<typeof operation.data, SubscriptionLifecycleTransition> = {
    lock: "locked",
    unlock: "unlocked",
    "renewal-due": "renewal_due",
    expire: "expired",
    "schedule-deletion": "scheduled_deletion"
  };
  try {
    const result = await transitionSubscriptionLifecycle(
      workspaceId.data,
      transitions[operation.data],
      new Date(),
      "scheduledDeleteAt" in schedule.data ? schedule.data.scheduledDeleteAt : undefined
    );
    res.status(200).json({
      data: {
        workspace: result.workspace,
        subscription: result.subscription
      }
    });
  } catch (error) {
    next(error);
  }
};
