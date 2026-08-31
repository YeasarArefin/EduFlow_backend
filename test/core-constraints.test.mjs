import pg from "pg";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { env } = require("../dist/backend/src/config/env.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceId = `00000000-0000-4000-8000-${suffix
  .replace(/[^0-9]/g, "")
  .padEnd(12, "0")
  .slice(-12)}`;
const memberId = `00000000-0000-4000-8001-${suffix
  .replace(/[^0-9]/g, "")
  .padEnd(12, "1")
  .slice(-12)}`;

async function query(text, values = []) {
  return pool.query(text, values);
}

describe("Phase 1.1 PostgreSQL constraints", () => {
  let createdPlatformOwner = false;
  beforeAll(async () => {
    await query("INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)", [
      workspaceId,
      "Constraint Test Workspace",
      `constraint-${suffix}`,
      `constraint-owner-${suffix}`
    ]);
  });

  afterAll(async () => {
    await query("DELETE FROM member_permission_overrides WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM workspace_settings WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    if (createdPlatformOwner) {
      await query("DELETE FROM platform_owners WHERE user_id = $1", [`constraint-platform-${suffix}`]);
    }
    await pool.end();
  });

  it("enforces the Platform Owner singleton", async () => {
    const userId = `constraint-platform-${suffix}`;
    const existingOwner = await query("SELECT id FROM platform_owners LIMIT 1");
    if (!existingOwner.rowCount) {
      await query("INSERT INTO platform_owners (user_id) VALUES ($1)", [userId]);
      createdPlatformOwner = true;
    }
    await expect(
      query("INSERT INTO platform_owners (user_id) VALUES ($1)", [createdPlatformOwner ? `second-${suffix}` : userId])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces unique workspace slugs", async () => {
    await expect(
      query("INSERT INTO workspaces (name, slug) VALUES ($1, $2)", ["Duplicate", `constraint-${suffix}`])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows one membership per workspace and user", async () => {
    const userId = `constraint-member-${suffix}`;
    await query("INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, $4)", [
      memberId,
      workspaceId,
      userId,
      101
    ]);
    await expect(
      query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, $3)", [
        workspaceId,
        userId,
        201
      ])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects invalid workspace role and permission references", async () => {
    await expect(
      query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, $3)", [
        workspaceId,
        `invalid-role-${suffix}`,
        999
      ])
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      query("INSERT INTO role_permissions (role_code, permission_code) VALUES ($1, $2)", [101, 9999])
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces unique member permission overrides", async () => {
    await query(
      "INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, $3, $4)",
      [workspaceId, memberId, 1101, true]
    );
    await expect(
      query(
        "INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, $3, $4)",
        [workspaceId, memberId, 1101, false]
      )
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces one settings row per workspace", async () => {
    await query("INSERT INTO workspace_settings (workspace_id) VALUES ($1)", [workspaceId]);
    await expect(
      query("INSERT INTO workspace_settings (workspace_id) VALUES ($1)", [workspaceId])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects invalid workspace foreign keys", async () => {
    const missingWorkspace = "00000000-0000-4000-8000-000000000001";
    await expect(
      query("INSERT INTO workspace_settings (workspace_id) VALUES ($1)", [missingWorkspace])
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, $3)", [
        missingWorkspace,
        `invalid-workspace-${suffix}`,
        101
      ])
    ).rejects.toMatchObject({ code: "23503" });
  });
});
