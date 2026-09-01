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

describe("approved purchase workspace provisioning", () => {
  let cookie;
  let userId;
  let workspaceId;
  const planId = randomUUID();

  beforeAll(async () => {
    const email = `onboarding-e2e-${suffix}@example.test`;
    const signUp = await request(app).post("/api/auth/sign-up/email").send({ name: "E2E Owner", email, password: "safe-test-password" }).expect(200);
    userId = signUp.body.user.id;
    cookie = (await request(app).post("/api/auth/sign-in/email").send({ email, password: "safe-test-password" }).expect(200)).headers["set-cookie"]?.[0];
    await pool.query("INSERT INTO plans (id, name, slug, price_minor, duration_days, trial_days) VALUES ($1, $2, $3, 100, 30, 0)", [planId, "E2E Plan", `e2e-plan-${suffix}`]);
    await pool.query(
      `INSERT INTO payment_requests (requested_by_user_id, purpose, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id, status, reviewed_at)
       VALUES ($1, 'subscription', $2, 100, 'bkash', '01700000000', $3, 'approved', NOW())`,
      [userId, planId, `E2E-${suffix}`]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM payment_requests WHERE requested_by_user_id = $1", [userId]);
    if (workspaceId) {
      await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_settings WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    }
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  it("creates a ready workspace only after payment approval", async () => {
    const created = await request(app).post("/api/v1/workspaces/onboard").set("Cookie", cookie).send({ name: "E2E Coaching", slug: `e2e-${suffix}` }).expect(201);
    workspaceId = created.body.data.id;
    const state = await request(app).get("/api/v1/workspaces/onboarding-state").set("Cookie", cookie).set("X-Workspace-Id", workspaceId).expect(200);
    expect(state.body.data).toMatchObject({ step: "ready", workspaceStatus: "active", access: { allowed: true, status: "active" } });
  });
});
