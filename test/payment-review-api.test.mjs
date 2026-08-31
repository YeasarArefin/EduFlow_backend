import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const { resolveWorkspaceEntitlements } = require("../dist/backend/src/services/workspace-entitlements.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceId = randomUUID();
const planId = randomUUID();
const featureKey = `feature-${suffix}`;
const secondaryWorkspaceId = randomUUID();
const ownerEmail = `owner-${suffix}@example.test`;
const memberEmail = `member-${suffix}@example.test`;

describe("Platform Owner payment review API", () => {
  let ownerId;
  let memberId;
  let ownerCookie;
  let memberCookie;
  let paymentId;

  beforeAll(async () => {
    for (const [email, name] of [
      [ownerEmail, "Platform Owner"],
      [memberEmail, "Workspace Member"]
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
      "Review Workspace",
      `review-${suffix}`
    ]);
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101)", [
      workspaceId,
      memberId
    ]);
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [
      planId,
      "Review Plan",
      `review-plan-${suffix}`
    ]);
    await pool.query("INSERT INTO features (key, name) VALUES ($1, $2)", [featureKey, "Review Feature"]);
    await pool.query(
      "INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, $2, true, 100)",
      [planId, featureKey]
    );
    const result = await pool.query(
      `INSERT INTO payment_requests (workspace_id, requested_by_user_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id)
       VALUES ($1, $2, $3, 50000, 'bkash', '01700000000', $4) RETURNING id`,
      [workspaceId, memberId, planId, `REVIEW-${suffix}`]
    );
    paymentId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [secondaryWorkspaceId]);
    await pool.query("DELETE FROM workspace_entitlement_overrides WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM plan_features WHERE feature_key = $1", [featureKey]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [secondaryWorkspaceId]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query("DELETE FROM features WHERE key = $1", [featureKey]);
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

  it("lists workspaces with owner-only access, filters, pagination, and summaries", async () => {
    await request(app)
      .get(`/api/v1/workspaces?limit=1&search=${encodeURIComponent(`review-${suffix}`)}&subscriptionStatus=active`)
      .set("Cookie", ownerCookie)
      .expect(200)
      .then((response) => {
        expect(response.body.meta).toMatchObject({
          page: 1,
          limit: 1,
          total: 0,
          totalPages: 0
        });
        expect(response.body.data).toEqual([]);
      });

    await request(app)
      .get(`/api/v1/workspaces?limit=1&search=${encodeURIComponent(`review-${suffix}`)}`)
      .set("Cookie", ownerCookie)
      .expect(200)
      .then((response) => {
        expect(response.body.meta).toMatchObject({
          page: 1,
          limit: 1,
          total: 1,
          totalPages: 1
        });
        expect(response.body.data[0]).toMatchObject({
          id: workspaceId,
          name: "Review Workspace",
          slug: `review-${suffix}`,
          subscription: null,
          access: { allowed: false, status: "payment_pending" }
        });
      });
    await request(app).get("/api/v1/workspaces").set("Cookie", memberCookie).expect(403);
  });

  it("approves a pending request and rejects a second review", async () => {
    const response = await request(app)
      .post(`/api/v1/payment-requests/${paymentId}/approve`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(200);
    expect(response.body.data).toMatchObject({
      id: paymentId,
      status: "approved",
      reviewedByUserId: ownerId
    });
    expect(response.body.data.reviewedAt).toBeTruthy();
    const subscription = await pool.query(
      "SELECT status, plan_id, starts_at, expires_at FROM subscriptions WHERE workspace_id = $1",
      [workspaceId]
    );
    expect(subscription.rows).toHaveLength(1);
    expect(subscription.rows[0]).toMatchObject({
      status: "active",
      plan_id: planId
    });
    expect(new Date(subscription.rows[0].expires_at).getTime()).toBeGreaterThan(
      new Date(subscription.rows[0].starts_at).getTime()
    );
    const workspaces = await request(app)
      .get(`/api/v1/workspaces?search=${encodeURIComponent(`review-${suffix}`)}&subscriptionStatus=active`)
      .set("Cookie", ownerCookie)
      .expect(200);
    expect(workspaces.body.data[0]).toMatchObject({
      subscription: {
        status: "active",
        plan: {
          id: planId,
          name: "Review Plan",
          slug: `review-plan-${suffix}`
        }
      },
      access: { allowed: true, status: "active" }
    });
    const detail = await request(app).get(`/api/v1/workspaces/${workspaceId}`).set("Cookie", ownerCookie).expect(200);
    expect(detail.body.data).toMatchObject({
      workspace: {
        id: workspaceId,
        name: "Review Workspace",
        status: "active"
      },
      subscription: {
        id: expect.any(String),
        status: "active",
        plan: { id: planId, name: "Review Plan" }
      },
      access: { allowed: true, status: "active" }
    });
    expect(detail.body.data.subscriptionHistory).toHaveLength(1);
    expect(detail.body.data.recentPayments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: paymentId,
          status: "approved",
          amountMinor: "50000"
        })
      ])
    );
    expect(detail.body.data.activeEntitlementOverrides).toEqual([]);
    const updatedPlan = await request(app)
      .patch(`/api/v1/plans/${planId}`)
      .set("Cookie", ownerCookie)
      .send({
        priceMinor: "99000",
        features: [{ featureKey, enabled: true, limitValue: "250" }]
      })
      .expect(200);
    expect(updatedPlan.body.data).toMatchObject({
      id: planId,
      priceMinor: "99000",
      features: [{ featureKey, enabled: true, limitValue: "250" }]
    });
    await request(app).post(`/api/v1/plans/${planId}/deactivate`).set("Cookie", ownerCookie).expect(200);
    const listedPlans = await request(app).get("/api/v1/plans").set("Cookie", ownerCookie).expect(200);
    expect(listedPlans.body.data.find((plan) => plan.id === planId)).toMatchObject({
      isActive: false,
      priceMinor: "99000"
    });
    const historicalPayment = await pool.query("SELECT amount_minor FROM payment_requests WHERE id = $1", [paymentId]);
    expect(historicalPayment.rows[0].amount_minor).toBe("50000");
    const override = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/entitlement-overrides`)
      .set("Cookie", ownerCookie)
      .send({
        featureKey,
        enabledOverride: false,
        limitOverride: "250",
        reason: "Temporary capacity exception",
        expiresAt: null
      })
      .expect(201);
    expect(override.body.data).toMatchObject({
      workspaceId,
      featureKey,
      enabledOverride: false,
      limitOverride: "250"
    });
    expect((await resolveWorkspaceEntitlements(workspaceId)).entitlements[featureKey]).toEqual({
      enabled: false,
      limit: 250n
    });
    await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active')", [
      secondaryWorkspaceId,
      "Secondary Workspace",
      `secondary-${suffix}`
    ]);
    await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status) VALUES ($1, $2, 'active')", [
      secondaryWorkspaceId,
      planId
    ]);
    expect((await resolveWorkspaceEntitlements(secondaryWorkspaceId)).entitlements[featureKey]).toEqual({
      enabled: true,
      limit: 250n
    });
    const detailWithOverride = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}`)
      .set("Cookie", ownerCookie)
      .expect(200);
    expect(detailWithOverride.body.data.activeEntitlementOverrides).toEqual(
      expect.arrayContaining([expect.objectContaining({ featureKey, enabled: false, limit: "250" })])
    );
    await request(app)
      .patch(`/api/v1/workspaces/${workspaceId}/entitlement-overrides/${override.body.data.id}`)
      .set("Cookie", ownerCookie)
      .send({ enabledOverride: true, limitOverride: "300" })
      .expect(200);
    expect((await resolveWorkspaceEntitlements(workspaceId)).entitlements[featureKey]).toEqual({
      enabled: true,
      limit: 300n
    });
    await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}/entitlement-overrides/${override.body.data.id}`)
      .set("Cookie", ownerCookie)
      .expect(204);
    expect((await resolveWorkspaceEntitlements(workspaceId)).entitlements[featureKey]).toEqual({
      enabled: true,
      limit: 250n
    });
    await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/entitlement-overrides`)
      .set("Cookie", memberCookie)
      .expect(403);
    await request(app).get("/api/v1/plans").set("Cookie", memberCookie).expect(403);
    await request(app).post(`/api/v1/plans/${planId}/activate`).set("Cookie", memberCookie).expect(403);
    const second = await request(app)
      .post(`/api/v1/payment-requests/${paymentId}/reject`)
      .set("Cookie", ownerCookie)
      .send({ rejectionReason: "Too late" })
      .expect(409);
    expect(second.body.error.code).toBe("PAYMENT_ALREADY_REVIEWED");
  });

  it("rejects a pending request with a reason", async () => {
    const result = await pool.query(
      `INSERT INTO payment_requests (workspace_id, requested_by_user_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id)
       VALUES ($1, $2, $3, 50000, 'bkash', '01700000000', $4) RETURNING id`,
      [workspaceId, memberId, planId, `REJECT-${suffix}`]
    );
    const response = await request(app)
      .post(`/api/v1/payment-requests/${result.rows[0].id}/reject`)
      .set("Cookie", ownerCookie)
      .send({ rejectionReason: "Invalid transaction" })
      .expect(200);
    expect(response.body.data).toMatchObject({
      status: "rejected",
      rejectionReason: "Invalid transaction",
      reviewedByUserId: ownerId
    });
  });

  it("rolls back approval when the payment is not a subscription", async () => {
    const result = await pool.query(
      `INSERT INTO payment_requests (workspace_id, requested_by_user_id, purpose, amount_minor, payment_method, sender_bkash_number, transaction_id)
       VALUES ($1, $2, 'sms_credit', 50000, 'bkash', '01700000000', $3) RETURNING id`,
      [workspaceId, memberId, `ROLLBACK-${suffix}`]
    );
    await request(app)
      .post(`/api/v1/payment-requests/${result.rows[0].id}/approve`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(400);
    const payment = await pool.query("SELECT status, reviewed_at FROM payment_requests WHERE id = $1", [
      result.rows[0].id
    ]);
    expect(payment.rows[0]).toMatchObject({
      status: "pending",
      reviewed_at: null
    });
  });

  it("returns not found for an unknown workspace", async () => {
    await request(app).get(`/api/v1/workspaces/${randomUUID()}`).set("Cookie", ownerCookie).expect(404);
  });
});
