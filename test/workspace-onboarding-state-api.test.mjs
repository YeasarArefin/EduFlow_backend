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
const email = `workspace-state-${suffix}@example.test`;
const workspaceIds = {
  created: randomUUID(),
  paymentRequired: randomUUID(),
  paymentPending: randomUUID(),
  ready: randomUUID()
};
const planId = randomUUID();

describe("workspace onboarding state API", () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    const signUp = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ name: "Workspace State User", email, password: "safe-test-password" })
      .expect(200);
    userId = signUp.body.user.id;

    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: "safe-test-password" })
      .expect(200);
    cookie = signIn.headers["set-cookie"]?.[0];

    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [
      planId,
      "Onboarding State Plan",
      `onboarding-state-plan-${suffix}`
    ]);

    for (const [key, workspaceId] of Object.entries(workspaceIds)) {
      await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, $4)", [
        workspaceId,
        `Onboarding ${key}`,
        `onboarding-${key}-${suffix}`,
        key === "created" || key === "paymentPending" ? "pending" : "active"
      ]);
      await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101)", [
        workspaceId,
        userId
      ]);
    }

    await pool.query(
      "INSERT INTO payment_requests (workspace_id, requested_by_user_id, purpose, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id, status) VALUES ($1, $2, 'subscription', $3, 125050, 'bkash', '01700000000', $4, 'pending')",
      [workspaceIds.paymentPending, userId, planId, `STATE-PAYMENT-${suffix}`]
    );
    await pool.query(
      "INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days')",
      [workspaceIds.ready, planId]
    );
  });

  afterAll(async () => {
    const ids = Object.values(workspaceIds);
    await pool.query("DELETE FROM payment_requests WHERE workspace_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  const endpoint = (workspaceId) =>
    request(app).get("/api/v1/workspaces/onboarding-state").set("Cookie", cookie).set("X-Workspace-Id", workspaceId);

  it.each([
    ["a newly created pending workspace", workspaceIds.created, "workspace_created", false],
    ["an active workspace without a subscription", workspaceIds.paymentRequired, "subscription_required", false],
    ["a workspace with a pending payment", workspaceIds.paymentPending, "payment_pending", true],
    ["an active workspace with an active subscription", workspaceIds.ready, "ready", false]
  ])("returns %s", async (_name, workspaceId, step, paymentPending) => {
    const response = await endpoint(workspaceId).expect(200);
    expect(response.body.data).toMatchObject({ step, paymentPending });
  });

  it("denies unauthenticated and non-member callers", async () => {
    await request(app)
      .get("/api/v1/workspaces/onboarding-state")
      .set("X-Workspace-Id", workspaceIds.created)
      .expect(401);
    const response = await endpoint(randomUUID()).expect(403);
    expect(response.body.error.code).toBe("WORKSPACE_MEMBERSHIP_REQUIRED");
  });
});
