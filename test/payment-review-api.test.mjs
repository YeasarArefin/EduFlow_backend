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
const planId = randomUUID();
const ownerEmail = `owner-${suffix}@example.test`;
const memberEmail = `member-${suffix}@example.test`;

describe("Platform Owner payment review API", () => {
  let ownerId;
  let memberId;
  let ownerCookie;
  let memberCookie;
  let paymentId;

  beforeAll(async () => {
    for (const [email, name] of [[ownerEmail, "Platform Owner"], [memberEmail, "Workspace Member"]]) {
      await request(app).post("/api/auth/sign-up/email").send({ name, email, password: "safe-test-password" }).expect(200);
    }
    ownerId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [ownerEmail])).rows[0].id;
    memberId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [memberEmail])).rows[0].id;
    ownerCookie = (await request(app).post("/api/auth/sign-in/email").send({ email: ownerEmail, password: "safe-test-password" }).expect(200)).headers["set-cookie"]?.[0];
    memberCookie = (await request(app).post("/api/auth/sign-in/email").send({ email: memberEmail, password: "safe-test-password" }).expect(200)).headers["set-cookie"]?.[0];
    await pool.query("INSERT INTO platform_owners (user_id) VALUES ($1)", [ownerId]);
    await pool.query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)", [workspaceId, "Review Workspace", `review-${suffix}`]);
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101)", [workspaceId, memberId]);
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [planId, "Review Plan", `review-plan-${suffix}`]);
    const result = await pool.query(
      `INSERT INTO payment_requests (workspace_id, requested_by_user_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id)
       VALUES ($1, $2, $3, 50000, 'bkash', '01700000000', $4) RETURNING id`,
      [workspaceId, memberId, planId, `REVIEW-${suffix}`],
    );
    paymentId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.query("DELETE FROM platform_owners WHERE user_id = $1", [ownerId]);
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [ownerId, memberId]);
    await pool.end();
  });

  it("lets Platform Owner list pending requests", async () => {
    const response = await request(app).get("/api/v1/payment-requests/pending").set("Cookie", ownerCookie).expect(200);
    expect(response.body.data.some((payment) => payment.id === paymentId && payment.status === "pending")).toBe(true);
  });

  it("denies normal workspace users", async () => {
    await request(app).get("/api/v1/payment-requests/pending").set("Cookie", memberCookie).expect(403);
  });

  it("approves a pending request and rejects a second review", async () => {
    const response = await request(app).post(`/api/v1/payment-requests/${paymentId}/approve`).set("Cookie", ownerCookie).send({}).expect(200);
    expect(response.body.data).toMatchObject({ id: paymentId, status: "approved", reviewedByUserId: ownerId });
    expect(response.body.data.reviewedAt).toBeTruthy();
    const subscription = await pool.query("SELECT status, plan_id, starts_at, expires_at FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
    expect(subscription.rows).toHaveLength(1);
    expect(subscription.rows[0]).toMatchObject({ status: "active", plan_id: planId });
    expect(new Date(subscription.rows[0].expires_at).getTime()).toBeGreaterThan(new Date(subscription.rows[0].starts_at).getTime());
    const second = await request(app).post(`/api/v1/payment-requests/${paymentId}/reject`).set("Cookie", ownerCookie).send({ rejectionReason: "Too late" }).expect(409);
    expect(second.body.error.code).toBe("PAYMENT_ALREADY_REVIEWED");
  });

  it("rejects a pending request with a reason", async () => {
    const result = await pool.query(
      `INSERT INTO payment_requests (workspace_id, requested_by_user_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id)
       VALUES ($1, $2, $3, 50000, 'bkash', '01700000000', $4) RETURNING id`,
      [workspaceId, memberId, planId, `REJECT-${suffix}`],
    );
    const response = await request(app).post(`/api/v1/payment-requests/${result.rows[0].id}/reject`).set("Cookie", ownerCookie).send({ rejectionReason: "Invalid transaction" }).expect(200);
    expect(response.body.data).toMatchObject({ status: "rejected", rejectionReason: "Invalid transaction", reviewedByUserId: ownerId });
  });

  it("rolls back approval when the payment is not a subscription", async () => {
    const result = await pool.query(
      `INSERT INTO payment_requests (workspace_id, requested_by_user_id, purpose, amount_minor, payment_method, sender_bkash_number, transaction_id)
       VALUES ($1, $2, 'sms_credit', 50000, 'bkash', '01700000000', $3) RETURNING id`,
      [workspaceId, memberId, `ROLLBACK-${suffix}`],
    );
    await request(app).post(`/api/v1/payment-requests/${result.rows[0].id}/approve`).set("Cookie", ownerCookie).send({}).expect(400);
    const payment = await pool.query("SELECT status, reviewed_at FROM payment_requests WHERE id = $1", [result.rows[0].id]);
    expect(payment.rows[0]).toMatchObject({ status: "pending", reviewed_at: null });
  });
});
