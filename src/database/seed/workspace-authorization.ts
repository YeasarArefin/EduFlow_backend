import { db, pool } from "../client";
import { permissions, rolePermissions, workspaceRoleCodes, workspaceRoles } from "../schema";
import { seedDevelopmentPlatformOwner } from "./development-platform-owner";
import { studentFeePermissions } from "../../config/student-fees";
import { attendancePermissions } from "../../config/attendance";

const roles = [
  {
    code: workspaceRoleCodes.owner,
    name: "Owner",
    description: "Workspace owner with full authority."
  },
  {
    code: workspaceRoleCodes.admin,
    name: "Admin",
    description: "Workspace administrator with explicitly assigned permissions."
  },
  {
    code: workspaceRoleCodes.teacher,
    name: "Teacher",
    description: "Teacher with explicitly assigned academic permissions."
  },
  {
    code: workspaceRoleCodes.staff,
    name: "Staff",
    description: "Staff member with explicitly assigned operational permissions."
  }
];

const permissionRows = [
  {
    code: 1601,
    key: "members.manage",
    name: "Manage workspace members",
    module: "members",
    description: "Add, update, suspend, and remove workspace members."
  },
  { ...studentFeePermissions.view, name: "View student fees", module: "fees", description: "View monthly student fee records." },
  { ...studentFeePermissions.generate, name: "Generate student fees", module: "fees", description: "Generate monthly student fee snapshots." },
  { ...studentFeePermissions.collect, name: "Collect student fees", module: "fees", description: "Record student fee payments and receipts." },
  {

    code: 1101,
    key: "students.view",
    name: "View students",
    module: "students",
    description: "View student records."
  },
  {
    code: 1102,
    key: "students.create",
    name: "Create students",
    module: "students",
    description: "Create student records."
  },
  {
    code: 1103,
    key: "students.update",
    name: "Update students",
    module: "students",
    description: "Update student records."
  },
  {
    code: 1104,
    key: "students.archive",
    name: "Archive students",
    module: "students",
    description: "Archive student records."
  },
  {
    code: 1105,
    key: "students.import",
    name: "Import students",
    module: "students",
    description: "Import student records."
  },
  {
    code: 1201,
    key: "batches.view",
    name: "View batches",
    module: "batches",
    description: "View batch profiles."
  },
  {
    code: 1202,
    key: "batches.create",
    name: "Create batches",
    module: "batches",
    description: "Create batch profiles."
  },
  {
    code: 1203,
    key: "batches.update",
    name: "Update batches",
    module: "batches",
    description: "Update batch profiles."
  },
  {
    code: 1204,
    key: "batches.archive",
    name: "Archive batches",
    module: "batches",
    description: "Archive batch profiles."
  },
  {
    ...attendancePermissions.view,
    name: "View attendance",
    module: "attendance",
    description: "View attendance records."
  },
  {
    ...attendancePermissions.mark,
    name: "Mark attendance",
    module: "attendance",
    description: "Mark attendance."
  },
  {
    ...attendancePermissions.update,
    name: "Update attendance",
    module: "attendance",
    description: "Update attendance records."
  },
  {
    ...attendancePermissions.finalize,
    name: "Finalize attendance",
    module: "attendance",
    description: "Finalize attendance sessions."
  }
];

export async function seedWorkspaceAuthorization(): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction
      .insert(workspaceRoles)
      .values(roles)
      .onConflictDoUpdate({
        target: workspaceRoles.code,
        set: {
          name: workspaceRoles.name,
          description: workspaceRoles.description
        }
      });

    await transaction
      .insert(permissions)
      .values(permissionRows)
      .onConflictDoUpdate({
        target: permissions.code,
        set: {
          key: permissions.key,
          name: permissions.name,
          module: permissions.module,
          description: permissions.description
        }
      });

    // Owner is the only role with design-defined default grants. Other roles are permission-driven.
    await transaction
      .insert(rolePermissions)
      .values(
        [
          ...permissionRows.map(({ code: permissionCode }) => ({
          roleCode: workspaceRoleCodes.owner,
          permissionCode
          })),
          { roleCode: workspaceRoleCodes.admin, permissionCode: 1601 }
        ]
      )
      .onConflictDoNothing();
  });
}

export async function seedDatabase(): Promise<void> {
  await seedWorkspaceAuthorization();
  await seedDevelopmentPlatformOwner();
}

if (require.main === module) {
  seedDatabase()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await pool.end();
      process.exitCode = 1;
    });
}
