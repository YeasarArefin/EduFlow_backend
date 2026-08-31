import { z } from "zod";
import { uuidSchema } from "./common.validation";

export const subscriptionOperationWorkspaceIdSchema = uuidSchema;
export const subscriptionOperationSchema = z.enum(["lock", "unlock", "renewal-due", "expire", "schedule-deletion"]);
export const scheduleDeletionSchema = z.object({ scheduledDeleteAt: z.coerce.date() }).strict();
