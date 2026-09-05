import { Router } from "express";
import { archiveBatchController, createBatchController, getBatchController, listBatchesController, updateBatchController } from "../../controllers/batch.controller";
import { assignBatchTeacherController, listBatchTeachersController, removeBatchTeacherController, updateBatchTeacherController } from "../../controllers/batch-teacher.controller";
import {
  deleteEnrollmentController,
  enrollStudentController,
  listBatchEnrollmentsController,
  updateEnrollmentController,
} from "../../controllers/batch-enrollment.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const batchRoutes = Router();
batchRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
batchRoutes.get("/", requirePermission("batches.view"), listBatchesController);
batchRoutes.post("/", requirePermission("batches.create"), createBatchController);
batchRoutes.get("/:id/teachers", requirePermission("batches.view"), listBatchTeachersController);
batchRoutes.post("/:id/teachers", requirePermission("batches.update"), assignBatchTeacherController);
batchRoutes.patch("/:id/teachers/:teacherId", requirePermission("batches.update"), updateBatchTeacherController);
batchRoutes.delete("/:id/teachers/:teacherId", requirePermission("batches.update"), removeBatchTeacherController);
batchRoutes.get("/:id/students", requirePermission("batches.view"), listBatchEnrollmentsController);
batchRoutes.post("/:id/students", requirePermission("batches.update"), enrollStudentController);
batchRoutes.patch("/:id/students/:enrollmentId", requirePermission("batches.update"), updateEnrollmentController);
batchRoutes.delete("/:id/students/:enrollmentId", requirePermission("batches.update"), deleteEnrollmentController);
batchRoutes.get("/:id", requirePermission("batches.view"), getBatchController);
batchRoutes.patch("/:id", requirePermission("batches.update"), updateBatchController);
batchRoutes.delete("/:id", requirePermission("batches.archive"), archiveBatchController);
