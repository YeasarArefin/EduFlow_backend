import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const planId = randomUUID();
const featureKey = `dashboard-feature-${suffix}`;
const email = `dashboard-${suffix}@example.test`;

describe("workspace dashboard summary API", () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    const signUp = await request(app).post("/api/auth/sign-up/email").send({ name: "Dashboard User", email, password: "safe-test-password" }).expect(200);
    userId = signUp.body.user.id;
    const signIn = await request(app).post("/api/auth/sign-in/email").send({ email, password: "safe-test-password" }).expect(200);
    cookie = signIn.headers["set-cookie"]?.[0];
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [planId, "Dashboard Plan", `dashboard-plan-${suffix}`]);
    await pool.query("INSERT INTO features (key, name) VALUES ($1, $2)", [featureKey, "Dashboard feature"]);
    await pool.query("INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, $2, true, 25)", [planId, featureKey]);
    await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $6, 'active')", [workspaceId, "Dashboard Workspace", `dashboard-${suffix}`, otherWorkspaceId, "Other Workspace", `other-dashboard-${suffix}`]);
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101), ($1, $3, 201)", [workspaceId, userId, `other-user-${suffix}`]);
    await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at, renewal_due_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days', now() + interval '30 days')", [workspaceId, planId]);
    await pool.query("INSERT INTO payment_requests (workspace_id, requested_by_user_id, purpose, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id, status, reviewed_at) VALUES ($1, $2, 'subscription', $3, 100, 'bkash', '01700000000', $4, 'approved', now())", [workspaceId, userId, planId, `DASH-${suffix}`]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM payment_requests WHERE workspace_id IN ($1, $2)", [workspaceId, otherWorkspaceId]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id IN ($1, $2)", [workspaceId, otherWorkspaceId]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)", [workspaceId, otherWorkspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceId, otherWorkspaceId]);
    await pool.query("DELETE FROM plan_features WHERE plan_id = $1", [planId]);
    await pool.query("DELETE FROM features WHERE key = $1", [featureKey]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  it("returns only the caller's workspace data and current access", async () => {
    const response = await request(app).get("/api/v1/workspaces/dashboard-summary").set("Cookie", cookie).set("X-Workspace-Id", workspaceId).expect(200);
    expect(response.body.data).toMatchObject({ workspace: { id: workspaceId, name: "Dashboard Workspace" }, access: { allowed: true, status: "active" }, memberCount: 2, subscription: { planName: "Dashboard Plan" } });
    expect(response.body.data.entitlements).toContainEqual({ key: featureKey, enabled: true, limit: "25" });
    expect(response.body.data.latestPayment).toMatchObject({ status: "approved" });
    expect(JSON.stringify(response.body.data)).not.toContain("Other Workspace");
  });

  it("denies unauthenticated and cross-workspace reads", async () => {
    await request(app).get("/api/v1/workspaces/dashboard-summary").set("X-Workspace-Id", workspaceId).expect(401);
    await request(app).get("/api/v1/workspaces/dashboard-summary").set("Cookie", cookie).set("X-Workspace-Id", otherWorkspaceId).expect(403);
  });
});
