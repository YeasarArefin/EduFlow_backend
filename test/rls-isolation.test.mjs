import pg from "pg";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { env } = require("../dist/backend/src/config/env.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceA = "00000000-0000-4000-8100-000000000001";
const workspaceB = "00000000-0000-4000-8100-000000000002";
const memberA = "00000000-0000-4000-8101-000000000001";
const memberB = "00000000-0000-4000-8101-000000000002";

const query = (text, values = []) => pool.query(text, values);

describe("workspace RLS policies", () => {
  beforeAll(async () => {
    await query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)", [workspaceA, "RLS A", `rls-a-${suffix}`, workspaceB, "RLS B", `rls-b-${suffix}`]);
    await query("INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, 101), ($4, $5, $6, 101)", [memberA, workspaceA, `rls-user-a-${suffix}`, memberB, workspaceB, `rls-user-b-${suffix}`]);
    await query("INSERT INTO workspace_settings (workspace_id) VALUES ($1), ($2)", [workspaceA, workspaceB]);
    await query("INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, 1101, true), ($3, $4, 1101, false)", [workspaceA, memberA, workspaceB, memberB]);
  });

  afterAll(async () => {
    await query("DELETE FROM member_permission_overrides WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await query("DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await query("DELETE FROM workspace_settings WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.end();
  });

  it("allows same-workspace access and blocks cross-workspace reads and writes", async () => {
    const client = await pool.connect();
    try {
      await client.query("SET ROLE eduflow_app");
      await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceA]);

      const visibleMembers = await client.query("SELECT workspace_id FROM workspace_members ORDER BY workspace_id");
      expect(visibleMembers.rows).toEqual([{ workspace_id: workspaceA }]);
      const visibleSettings = await client.query("SELECT workspace_id FROM workspace_settings");
      expect(visibleSettings.rows).toEqual([{ workspace_id: workspaceA }]);
      const visibleOverrides = await client.query("SELECT workspace_id FROM member_permission_overrides");
      expect(visibleOverrides.rows).toEqual([{ workspace_id: workspaceA }]);

      const blockedUpdate = await client.query("UPDATE workspace_settings SET receipt_prefix = 'blocked' WHERE workspace_id = $1", [workspaceB]);
      expect(blockedUpdate.rowCount).toBe(0);
      const sameWorkspaceUpdate = await client.query("UPDATE workspace_settings SET receipt_prefix = 'allowed' WHERE workspace_id = $1", [workspaceA]);
      expect(sameWorkspaceUpdate.rowCount).toBe(1);
      await expect(client.query("INSERT INTO workspace_settings (workspace_id) VALUES ($1)", [workspaceB])).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });
});
