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
const planId = randomUUID();
const email = `workspace-onboarding-${suffix}@example.test`;

describe("workspace onboarding API", () => {
  let cookie;
  let userId;
  let workspaceId;
  let purchaseId;
  const endpoint = () => request(app).post("/api/v1/workspaces/onboard").set("Cookie", cookie);
  const body = (slug = `onboarding-${suffix}`) => ({ name: "Onboarding Coaching Centre", slug, phone: "01700000000" });

  beforeAll(async () => {
    const signedUp = await request(app).post("/api/auth/sign-up/email").send({ name: "Workspace User", email, password: "safe-test-password" }).expect(200);
    userId = signedUp.body.user.id;
    cookie = (await request(app).post("/api/auth/sign-in/email").send({ email, password: "safe-test-password" }).expect(200)).headers["set-cookie"]?.[0];
    await pool.query("INSERT INTO plans (id, name, slug, price_minor, duration_days, trial_days) VALUES ($1, $2, $3, 125050, 30, 0)", [planId, "Onboarding Plan", `onboarding-plan-${suffix}`]);
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

  it("requires authentication and an approved unused purchase", async () => {
    await request(app).post("/api/v1/workspaces/onboard").send(body()).expect(401);
    const blocked = await endpoint().send(body()).expect(409);
    expect(blocked.body.error.code).toBe("WORKSPACE_CREATION_NOT_UNLOCKED");
    expect((await request(app).get("/api/v1/account/state").set("Cookie", cookie).expect(200)).body.data).toEqual({ route: "account" });
  });

  it("provisions one active workspace and consumes the approved purchase", async () => {
    purchaseId = randomUUID();
    await pool.query(
      `INSERT INTO payment_requests (id, requested_by_user_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id, status, reviewed_at)
       VALUES ($1, $2, $3, 125050, 'bkash', '01700000000', $4, 'approved', NOW())`,
      [purchaseId, userId, planId, `APPROVED-${suffix}`]
    );
    expect((await request(app).get("/api/v1/account/state").set("Cookie", cookie).expect(200)).body.data).toEqual({ route: "workspace_creation" });
    const created = await endpoint().send(body()).expect(201);
    workspaceId = created.body.data.id;
    expect(created.body.data).toMatchObject({ name: "Onboarding Coaching Centre", status: "active" });
    expect((await pool.query("SELECT workspace_id FROM workspace_settings WHERE workspace_id = $1", [workspaceId])).rowCount).toBe(1);
    expect((await pool.query("SELECT role_code FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [workspaceId, userId])).rows).toEqual([{ role_code: 101 }]);
    expect((await pool.query("SELECT status, plan_id FROM subscriptions WHERE workspace_id = $1", [workspaceId])).rows).toEqual([{ status: "active", plan_id: planId }]);
    expect((await pool.query("SELECT workspace_id FROM payment_requests WHERE id = $1", [purchaseId])).rows).toEqual([{ workspace_id: workspaceId }]);
    expect((await request(app).get("/api/v1/account/state").set("Cookie", cookie).expect(200)).body.data).toEqual({ route: "dashboard", workspaceId });
    const repeated = await endpoint().send(body(`second-${suffix}`)).expect(409);
    expect(repeated.body.error.code).toBe("WORKSPACE_ALREADY_EXISTS");
  });
});
