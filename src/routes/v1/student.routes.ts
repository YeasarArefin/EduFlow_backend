import { Router } from "express";
import { archiveStudentController, createStudentController, getStudentController, listStudentEnrollmentsController, listStudentsController, updateStudentController } from "../../controllers/student.controller";
import { requireAuth } from "../../middleware/require-auth";
import { requirePermission } from "../../middleware/require-permission";
import { requireWorkspaceSubscriptionAccess } from "../../middleware/require-subscription-access";
import { requireWorkspaceContext } from "../../middleware/require-workspace-context";

export const studentRoutes = Router();
studentRoutes.use(requireAuth, requireWorkspaceContext, requireWorkspaceSubscriptionAccess);
studentRoutes.get("/", requirePermission("students.view"), listStudentsController);
studentRoutes.post("/", requirePermission("students.create"), createStudentController);
studentRoutes.get("/:id/enrollments", requirePermission("students.view"), listStudentEnrollmentsController);
studentRoutes.get("/:id", requirePermission("students.view"), getStudentController);
studentRoutes.patch("/:id", requirePermission("students.update"), updateStudentController);
studentRoutes.delete("/:id", requirePermission("students.archive"), archiveStudentController);
