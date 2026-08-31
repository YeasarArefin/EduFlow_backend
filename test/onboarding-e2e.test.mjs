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

describe("signup to workspace onboarding flow", () => {
  let cookie;
  let userId;
  let workspaceId;
  const slug = `e2e-${suffix}`;
  const planId = randomUUID();
  beforeAll(async () => {
    const signUp = await request(app).post("/api/auth/sign-up/email").send({ name: "E2E Owner", email: `e2e-${suffix}@example.test`, password: "safe-test-password" }).expect(200);
    userId = signUp.body.user.id;
    const signIn = await request(app).post("/api/auth/sign-in/email").send({ email: `e2e-${suffix}@example.test`, password: "safe-test-password" }).expect(200);
    cookie = signIn.headers["set-cookie"]?.[0];
  });
  afterAll(async () => {
    if (workspaceId) {
      await pool.query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_settings WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    }
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });
  const onboard = () => request(app).post("/api/v1/workspaces/onboard").set("Cookie", cookie);
  const state = () => request(app).get("/api/v1/workspaces/onboarding-state").set("Cookie", cookie).set("X-Workspace-Id", workspaceId);

  it("provisions the owner and resolves onboarding state", async () => {
    const created = await onboard().send({ name: "E2E Coaching", slug, phone: "01700000000" }).expect(201);
    workspaceId = created.body.data.id;
    expect((await pool.query("SELECT workspace_id FROM workspace_settings WHERE workspace_id = $1", [workspaceId])).rowCount).toBe(1);
    expect((await pool.query("SELECT role_code FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [workspaceId, userId])).rows).toEqual([{ role_code: 101 }]);
    expect((await state()).body.data.step).toBe("workspace_created");
  });
  it("rejects duplicate slugs and unauthenticated state access", async () => {
    await onboard().send({ name: "Duplicate", slug }).expect(409);
    await request(app).get("/api/v1/workspaces/onboarding-state").set("X-Workspace-Id", workspaceId).expect(401);
  });
  it("resolves payment pending, subscription required, and ready", async () => {
    await pool.query("UPDATE workspaces SET status = 'active' WHERE id = $1", [workspaceId]);
    expect((await state()).body.data.step).toBe("subscription_required");
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [planId, "E2E Plan", `e2e-plan-${suffix}`]);
    await pool.query("INSERT INTO payment_requests (workspace_id, requested_by_user_id, purpose, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id, status) VALUES ($1, $2, 'subscription', $3, 1, 'bkash', '01700000000', $4, 'pending')", [workspaceId, userId, planId, `E2E-${suffix}`]);
    expect((await state()).body.data.step).toBe("payment_pending");
    await pool.query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
    await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days')", [workspaceId, planId]);
    expect((await state()).body.data.step).toBe("ready");
  });
  it("rolls back all provisioning writes on forced failure", async () => {
    const failedSlug = `rollback-${suffix}`;
    const fn = `e2e_fail_${suffix.replace(/-/g, "_")}`;
    const trigger = `${fn}_trigger`;
    await pool.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced'; END; $$`);
    await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON workspace_settings FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try { await onboard().send({ name: "Rollback", slug: failedSlug }).expect(500); } finally { await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON workspace_settings`); await pool.query(`DROP FUNCTION IF EXISTS ${fn}()`); }
    expect((await pool.query("SELECT id FROM workspaces WHERE slug = $1", [failedSlug])).rowCount).toBe(0);
  });
});
