import { db, pool } from "../client";
import { permissions, rolePermissions, workspaceRoles } from "../schema";

const roles = [
  {
    code: 101,
    name: "Owner",
    description: "Workspace owner with full authority."
  },
  {
    code: 201,
    name: "Admin",
    description: "Workspace administrator with explicitly assigned permissions."
  },
  {
    code: 301,
    name: "Teacher",
    description: "Teacher with explicitly assigned academic permissions."
  },
  {
    code: 401,
    name: "Staff",
    description: "Staff member with explicitly assigned operational permissions."
  }
];

const permissionRows = [
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
    code: 1301,
    key: "attendance.view",
    name: "View attendance",
    module: "attendance",
    description: "View attendance records."
  },
  {
    code: 1302,
    key: "attendance.mark",
    name: "Mark attendance",
    module: "attendance",
    description: "Mark attendance."
  },
  {
    code: 1303,
    key: "attendance.update",
    name: "Update attendance",
    module: "attendance",
    description: "Update attendance records."
  },
  {
    code: 1304,
    key: "attendance.finalize",
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
        permissionRows.map(({ code: permissionCode }) => ({
          roleCode: 101,
          permissionCode
        }))
      )
      .onConflictDoNothing();
  });
}

if (require.main === module) {
  seedWorkspaceAuthorization()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await pool.end();
      process.exitCode = 1;
    });
}
