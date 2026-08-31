import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { pool } = require("../dist/backend/src/database/client.js");
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceId = randomUUID();
const membershipId = randomUUID();
const planId = randomUUID();
const ownerEmail = `e2e-owner-${suffix}@example.test`;
const memberEmail = `e2e-member-${suffix}@example.test`;

describe("end-to-end subscription lifecycle", () => {
  let ownerId;
  let memberId;
  let ownerCookie;
  let memberCookie;
  let paymentId;
  let activeExpiry;

  beforeAll(async () => {
    for (const [email, name] of [
      [ownerEmail, "E2E Owner"],
      [memberEmail, "E2E Member"]
    ]) {
      await request(app)
        .post("/api/auth/sign-up/email")
        .send({ name, email, password: "safe-test-password" })
        .expect(200);
    }
    ownerId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [ownerEmail])).rows[0].id;
    memberId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [memberEmail])).rows[0].id;
    ownerCookie = (
      await request(app)
        .post("/api/auth/sign-in/email")
        .send({ email: ownerEmail, password: "safe-test-password" })
        .expect(200)
    ).headers["set-cookie"]?.[0];
    memberCookie = (
      await request(app)
        .post("/api/auth/sign-in/email")
        .send({ email: memberEmail, password: "safe-test-password" })
        .expect(200)
    ).headers["set-cookie"]?.[0];
    await pool.query("INSERT INTO platform_owners (user_id) VALUES ($1)", [ownerId]);
    await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active')", [
      workspaceId,
      "E2E Workspace",
      `e2e-${suffix}`
    ]);
    await pool.query("INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, 101)", [
      membershipId,
      workspaceId,
      memberId
    ]);
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [
      planId,
      "E2E Plan",
      `e2e-plan-${suffix}`
    ]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspace_members WHERE id = $1", [membershipId]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.query("DELETE FROM platform_owners WHERE user_id = $1", [ownerId]);
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [ownerId, memberId]);
    await pool.end();
  });

  it("completes submission, approval, renewal, expiry, lock, and deletion scheduling", async () => {
    const submission = await request(app)
      .post("/api/v1/payment-requests")
      .set("Cookie", memberCookie)
      .set("X-Workspace-Id", workspaceId)
      .send({
        planId,
        amount: "125050",
        paymentMethod: "bkash",
        senderNumber: "01700000000",
        transactionId: `E2E-${suffix}`
      })
      .expect(201);
    paymentId = submission.body.data.id;
    const approved = await request(app)
      .post(`/api/v1/payment-requests/${paymentId}/approve`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(200);
    expect(approved.body.data.status).toBe("approved");

    let subscriptions = await pool.query(
      "SELECT id, status, plan_id, expires_at FROM subscriptions WHERE workspace_id = $1 ORDER BY created_at",
      [workspaceId]
    );
    expect(subscriptions.rows).toHaveLength(1);
    expect(subscriptions.rows[0]).toMatchObject({
      status: "active",
      plan_id: planId
    });
    activeExpiry = new Date(subscriptions.rows[0].expires_at);

    await pool.query(
      "UPDATE subscriptions SET renewal_due_at = now() - interval '1 second', expires_at = now() - interval '1 second' WHERE workspace_id = $1",
      [workspaceId]
    );
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/renewal-due`)
      .set("Cookie", ownerCookie)
      .expect(200);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/renewal-due`)
      .set("Cookie", ownerCookie)
      .expect(200);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/expire`)
      .set("Cookie", ownerCookie)
      .expect(200);

    const renewal = await pool.query(
      "INSERT INTO payment_requests (workspace_id, requested_by_user_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id) VALUES ($1, $2, $3, 125050, 'bkash', '01700000000', $4) RETURNING id",
      [workspaceId, memberId, planId, `RENEW-${suffix}`]
    );
    await request(app)
      .post(`/api/v1/payment-requests/${renewal.rows[0].id}/approve`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(200);
    subscriptions = await pool.query("SELECT status FROM subscriptions WHERE workspace_id = $1 ORDER BY created_at", [
      workspaceId
    ]);
    expect(subscriptions.rows.map(({ status }) => status)).toEqual(["expired", "active"]);

    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/expire`)
      .set("Cookie", ownerCookie)
      .expect(409);
    await pool.query("UPDATE subscriptions SET status = 'expired' WHERE workspace_id = $1 AND status = 'active'", [
      workspaceId
    ]);
    const historyBeforeOperations = await pool.query(
      "SELECT count(*)::int AS count FROM subscriptions WHERE workspace_id = $1",
      [workspaceId]
    );
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/lock`)
      .set("Cookie", ownerCookie)
      .expect(200);
    await pool.query(
      "UPDATE subscriptions SET status = 'active' WHERE id = (SELECT id FROM subscriptions WHERE workspace_id = $1 AND status = 'expired' ORDER BY created_at DESC LIMIT 1)",
      [workspaceId]
    );
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/unlock`)
      .set("Cookie", ownerCookie)
      .expect(200);
    await pool.query("UPDATE subscriptions SET status = 'expired' WHERE workspace_id = $1 AND status = 'active'", [
      workspaceId
    ]);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/lock`)
      .set("Cookie", ownerCookie)
      .expect(200);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/lock`)
      .set("Cookie", ownerCookie)
      .expect(200);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/schedule-deletion`)
      .set("Cookie", ownerCookie)
      .send({
        scheduledDeleteAt: new Date(Date.now() + 86400000).toISOString()
      })
      .expect(200);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/schedule-deletion`)
      .set("Cookie", ownerCookie)
      .send({
        scheduledDeleteAt: new Date(Date.now() + 86400000).toISOString()
      })
      .expect(200);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/subscription-operations/lock`)
      .set("Cookie", memberCookie)
      .expect(403);
    const historyAfterOperations = await pool.query(
      "SELECT count(*)::int AS count FROM subscriptions WHERE workspace_id = $1",
      [workspaceId]
    );
    expect(historyAfterOperations.rows[0].count).toBe(historyBeforeOperations.rows[0].count);
  });

  it("rejects without activation and keeps invalid approval atomic", async () => {
    const before = await pool.query("SELECT count(*)::int AS count FROM subscriptions WHERE workspace_id = $1", [
      workspaceId
    ]);
    const rejected = await pool.query(
      "INSERT INTO payment_requests (workspace_id, requested_by_user_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id) VALUES ($1, $2, $3, 125050, 'bkash', '01700000000', $4) RETURNING id",
      [workspaceId, memberId, planId, `REJECT-E2E-${suffix}`]
    );
    await request(app)
      .post(`/api/v1/payment-requests/${rejected.rows[0].id}/reject`)
      .set("Cookie", ownerCookie)
      .send({ rejectionReason: "Not valid" })
      .expect(200);
    const after = await pool.query("SELECT count(*)::int AS count FROM subscriptions WHERE workspace_id = $1", [
      workspaceId
    ]);
    expect(after.rows[0].count).toBe(before.rows[0].count);

    const invalid = await pool.query(
      "INSERT INTO payment_requests (workspace_id, requested_by_user_id, purpose, amount_minor, payment_method, sender_bkash_number, transaction_id) VALUES ($1, $2, 'sms_credit', 125050, 'bkash', '01700000000', $3) RETURNING id",
      [workspaceId, memberId, `INVALID-E2E-${suffix}`]
    );
    await request(app)
      .post(`/api/v1/payment-requests/${invalid.rows[0].id}/approve`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(400);
    const state = await pool.query("SELECT status, reviewed_at FROM payment_requests WHERE id = $1", [
      invalid.rows[0].id
    ]);
    expect(state.rows[0]).toMatchObject({
      status: "pending",
      reviewed_at: null
    });
  });

  it("rejects repeated approval safely", async () => {
    await request(app)
      .post(`/api/v1/payment-requests/${paymentId}/approve`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(409);
  });
});
