import { createRequire } from "node:module";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { pool } = require("../dist/backend/src/database/client.js");
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `auth-${suffix}@example.test`;
const workspaceId = "00000000-0000-4000-8200-000000000001";
const deniedWorkspaceId = "00000000-0000-4000-8200-000000000002";
const membershipId = "00000000-0000-4000-8201-000000000001";
const deniedMembershipId = "00000000-0000-4000-8201-000000000002";
const planId = randomUUID();

describe("Better Auth email/password foundation", () => {
  const app = createApp();

  afterAll(async () => {
    await pool.query("DELETE FROM member_permission_overrides WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspace_entitlement_overrides WHERE workspace_id IN ($1, $2)", [workspaceId, deniedWorkspaceId]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id IN ($1, $2)", [workspaceId, deniedWorkspaceId]);
    await pool.query("DELETE FROM plan_features WHERE plan_id = $1", [planId]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [deniedWorkspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [deniedWorkspaceId]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
    await pool.end();
  });

  it("creates a user, creates a login session, and looks it up from its cookie", async () => {
    const signUpResponse = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ name: "Auth Test User", email, password: "safe-test-password" })
      .expect(200);

    expect(signUpResponse.body.user).toMatchObject({ email, name: "Auth Test User" });

    const userResult = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
    expect(userResult.rowCount).toBe(1);

    const loginResponse = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: "safe-test-password" })
      .expect(200);
    const cookie = loginResponse.headers["set-cookie"]?.[0];

    expect(cookie).toBeTruthy();
    const sessionResponse = await request(app).get("/api/auth/get-session").set("Cookie", cookie).expect(200);

    expect(sessionResponse.body.user).toMatchObject({ email });
    expect(sessionResponse.body.session.userId).toBe(userResult.rows[0].id);

    const contextResponse = await request(app).get("/api/v1/auth-context").set("Cookie", cookie).expect(200);
    expect(contextResponse.body).toEqual({ data: { userId: userResult.rows[0].id } });

    await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active')", [workspaceId, "Auth Context Workspace", `auth-context-${suffix}`]);
    await pool.query("INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, $4)", [membershipId, workspaceId, userResult.rows[0].id, 101]);
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, 'Pipeline Plan', $2, 30, 0)", [planId, `pipeline-${suffix}`]);
    await pool.query("INSERT INTO features (key, name) VALUES ('students', 'Students') ON CONFLICT (key) DO NOTHING");
    await pool.query("INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, 'students', true, 100)", [planId]);
    await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status, expires_at) VALUES ($1, $2, 'active', now() + interval '1 day')", [workspaceId, planId]);

    const workspaceResponse = await request(app)
      .get("/api/v1/workspace-context")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", workspaceId)
      .expect(200);
    expect(workspaceResponse.body).toEqual({ data: { workspaceId, membershipId, roleCode: 101 } });

    await pool.query("INSERT INTO role_permissions (role_code, permission_code) VALUES (101, 1101) ON CONFLICT DO NOTHING");
    await request(app).get("/api/v1/access-pipeline-example").set("Cookie", cookie).set("X-Workspace-Id", workspaceId).expect(200);

    const nonMemberResponse = await request(app)
      .get("/api/v1/workspace-context")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", "00000000-0000-4000-8200-000000000002")
      .expect(403);
    expect(nonMemberResponse.body.error.code).toBe("WORKSPACE_MEMBERSHIP_REQUIRED");

    await pool.query("UPDATE subscriptions SET status = 'expired' WHERE workspace_id = $1", [workspaceId]);
    const blockedSubscriptionResponse = await request(app).get("/api/v1/access-pipeline-example").set("Cookie", cookie).set("X-Workspace-Id", workspaceId).expect(403);
    expect(blockedSubscriptionResponse.body.error.code).toBe("SUBSCRIPTION_ACCESS_REQUIRED");
    await pool.query("UPDATE subscriptions SET status = 'active' WHERE workspace_id = $1", [workspaceId]);

    await pool.query("INSERT INTO workspace_entitlement_overrides (workspace_id, feature_key, enabled_override, reason) VALUES ($1, 'students', false, 'pipeline test')", [workspaceId]);
    const disabledEntitlementResponse = await request(app).get("/api/v1/access-pipeline-example").set("Cookie", cookie).set("X-Workspace-Id", workspaceId).expect(403);
    expect(disabledEntitlementResponse.body.error.code).toBe("FEATURE_ENTITLEMENT_REQUIRED");
    await pool.query("DELETE FROM workspace_entitlement_overrides WHERE workspace_id = $1", [workspaceId]);

    await pool.query("INSERT INTO role_permissions (role_code, permission_code) VALUES (101, 1101) ON CONFLICT DO NOTHING");
    const rolePermissionResponse = await request(app)
      .get("/api/v1/permission-guard-example")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", workspaceId)
      .expect(200);
    expect(rolePermissionResponse.body.data.userId).toBe(userResult.rows[0].id);

    await pool.query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)", [deniedWorkspaceId, "Denied Workspace", `denied-${suffix}`]);
    await pool.query("INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, 201)", [deniedMembershipId, deniedWorkspaceId, userResult.rows[0].id]);
    await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status, expires_at) VALUES ($1, $2, 'active', now() + interval '1 day')", [deniedWorkspaceId, planId]);
    const missingPermissionResponse = await request(app)
      .get("/api/v1/permission-guard-example")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", deniedWorkspaceId)
      .expect(403);
    expect(missingPermissionResponse.body.error.code).toBe("PERMISSION_REQUIRED");

    await pool.query("INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, 1101, true)", [workspaceId, membershipId]);
    const allowOverrideResponse = await request(app)
      .get("/api/v1/permission-guard-example")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", workspaceId)
      .expect(200);
    expect(allowOverrideResponse.body.data.userId).toBe(userResult.rows[0].id);

    await pool.query("UPDATE member_permission_overrides SET allowed = false WHERE workspace_id = $1 AND member_id = $2 AND permission_code = 1101", [workspaceId, membershipId]);
    const denyOverrideResponse = await request(app)
      .get("/api/v1/permission-guard-example")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", workspaceId)
      .expect(403);
    expect(denyOverrideResponse.body.error.code).toBe("PERMISSION_REQUIRED");
  });
});
