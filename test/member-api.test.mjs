import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  workspaceA = randomUUID(),
  workspaceB = randomUUID(),
  planId = randomUUID();
let ownerId, ownerCookie, ownerMemberId, roleId, memberId;
const headers = (workspaceId = workspaceA, cookie = ownerCookie) => ({ Cookie: cookie, "X-Workspace-Id": workspaceId });
async function signup(name, email) {
  const sign = await request(app).post("/api/auth/sign-up/email").send({ name, email, password: "safe-test-password" });
  const login = await request(app).post("/api/auth/sign-in/email").send({ email, password: "safe-test-password" });
  return { id: sign.body.user.id, cookie: login.headers["set-cookie"]?.[0] };
}
describe("workspace custom roles and member accounts", () => {
  beforeAll(async () => {
    const owner = await signup("Member Owner", `owner-${suffix}@example.test`);
    ownerId = owner.id;
    ownerCookie = owner.cookie;
    await pool.query("INSERT INTO plans (id,name,slug,duration_days,trial_days) VALUES ($1,$2,$3,30,0)", [
      planId,
      "Member Test",
      `member-${suffix}`
    ]);
    await pool.query("INSERT INTO workspaces (id,name,slug,status) VALUES ($1,$2,$3,'active'),($4,$5,$6,'active')", [
      workspaceA,
      "Member A",
      `member-a-${suffix}`,
      workspaceB,
      "Member B",
      `member-b-${suffix}`
    ]);
    await pool.query(
      "INSERT INTO subscriptions (workspace_id,plan_id,status,expires_at) VALUES ($1,$2,'active',now()+interval '30 days')",
      [workspaceA, planId]
    );
    ownerMemberId = (
      await pool.query(
        "INSERT INTO workspace_members (workspace_id,user_id,role_code) VALUES ($1,$2,101) RETURNING id",
        [workspaceA, ownerId]
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await pool.query("DELETE FROM audit_logs WHERE workspace_id IN ($1,$2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM member_permission_overrides WHERE workspace_id IN ($1,$2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM workspace_custom_role_permissions WHERE workspace_id IN ($1,$2)", [
      workspaceA,
      workspaceB
    ]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id IN ($1,$2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM workspace_custom_roles WHERE workspace_id IN ($1,$2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id=$1", [workspaceA]);
    await pool.query("DELETE FROM workspaces WHERE id IN ($1,$2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM plans WHERE id=$1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [ownerId]);
    await pool.end();
  });
  it("creates workspace-owned roles and provisions accounts in the current workspace", async () => {
    const role = await request(app)
      .post("/api/v1/permission-management/roles")
      .set(headers())
      .send({ name: "Office Manager", permissions: [{ permissionCode: 1601, allowed: true }] })
      .expect(201);
    roleId = role.body.data.id;
    expect(role.body.data.name).toBe("Office Manager");
    const email = `office-${suffix}@example.test`;
    const added = await request(app)
      .post("/api/v1/members")
      .set(headers())
      .send({ name: "Office Member", email, password: "safe-test-password", roleId })
      .expect(201);
    memberId = added.body.data.id;
    expect(added.body.data).toMatchObject({ name: "Office Member", email, role: "Office Manager", status: "active" });
    await request(app)
      .get(`/api/v1/members?roleId=${roleId}`)
      .set(headers())
      .expect(200)
      .expect(({ body }) => expect(body.meta.total).toBe(1));
    const login = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: "safe-test-password" })
      .expect(200);
    await request(app).get("/api/v1/members").set(headers(workspaceA, login.headers["set-cookie"]?.[0])).expect(200);
  });
  it("keeps roles tenant scoped and protects owner membership", async () => {
    await request(app)
      .post("/api/v1/members")
      .set(headers(workspaceB))
      .send({ name: "Other", email: `other-${suffix}@example.test`, password: "safe-test-password", roleId })
      .expect(403);
    await request(app).patch(`/api/v1/members/${ownerMemberId}/role`).set(headers()).send({ roleId }).expect(409);
    await request(app).delete(`/api/v1/permission-management/roles/${roleId}`).set(headers()).expect(409);
    await request(app)
      .patch(`/api/v1/members/${memberId}/status`)
      .set(headers())
      .send({ status: "suspended" })
      .expect(200);
  });
});
