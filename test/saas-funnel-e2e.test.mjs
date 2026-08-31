import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const {
  DEVELOPMENT_PLATFORM_OWNER,
  seedDevelopmentPlatformOwner
} = require("../dist/backend/src/database/seed/development-platform-owner.js");

const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const activePlanId = randomUUID();
const inactivePlanId = randomUUID();
const customerEmail = `saas-funnel-${suffix}@example.test`;

describe("full SaaS customer and Platform Owner funnel", () => {
  let customerId;
  let customerCookie;
  let platformOwnerCookie;
  let workspaceId;

  const onboardingState = (id = workspaceId) =>
    request(app)
      .get("/api/v1/workspaces/onboarding-state")
      .set("Cookie", customerCookie)
      .set("X-Workspace-Id", id);

  const submitPayment = (transactionId, planId = activePlanId, amount = "125050") =>
    request(app)
      .post("/api/v1/payment-requests")
      .set("Cookie", customerCookie)
      .set("X-Workspace-Id", workspaceId)
      .send({
        planId,
        amount,
        paymentMethod: "bkash",
        senderNumber: "01700000000",
        transactionId
      });

  const latestPayment = () =>
    request(app)
      .get("/api/v1/payment-requests/latest")
      .set("Cookie", customerCookie)
      .set("X-Workspace-Id", workspaceId);

  beforeAll(async () => {
    await pool.query(
      "INSERT INTO plans (id, name, slug, price_minor, duration_days, trial_days, is_active) VALUES ($1, $2, $3, $4, $5, $6, true), ($7, $8, $9, $10, $11, $12, false)",
      [
        activePlanId,
        "Funnel Plan",
        `funnel-plan-${suffix}`,
        "125050",
        30,
        7,
        inactivePlanId,
        "Inactive Funnel Plan",
        `inactive-funnel-plan-${suffix}`,
        "99000",
        30,
        0
      ]
    );

    const signUp = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ name: "SaaS Funnel Owner", email: customerEmail, password: "safe-test-password" })
      .expect(200);
    customerId = signUp.body.user.id;
    customerCookie = (
      await request(app)
        .post("/api/auth/sign-in/email")
        .send({ email: customerEmail, password: "safe-test-password" })
        .expect(200)
    ).headers["set-cookie"]?.[0];

    await seedDevelopmentPlatformOwner("development");
    platformOwnerCookie = (
      await request(app)
        .post("/api/auth/sign-in/email")
        .send({
          email: DEVELOPMENT_PLATFORM_OWNER.email,
          password: DEVELOPMENT_PLATFORM_OWNER.password
        })
        .expect(200)
    ).headers["set-cookie"]?.[0];
  });

  afterAll(async () => {
    if (workspaceId) {
      await pool.query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_settings WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    }
    await pool.query("DELETE FROM plans WHERE id IN ($1, $2)", [activePlanId, inactivePlanId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [customerId]);
    await pool.end();
  });

  it("takes a customer from a public plan through rejected-payment recovery to ready", async () => {
    const plans = await request(app).get("/api/v1/public/plans").expect(200);
    const selectedPlan = plans.body.data.find((plan) => plan.id === activePlanId);
    expect(selectedPlan).toMatchObject({
      id: activePlanId,
      slug: `funnel-plan-${suffix}`,
      priceMinor: "125050",
      durationDays: 30,
      trial: { included: true, days: 7 }
    });
    expect(plans.body.data.some((plan) => plan.id === inactivePlanId)).toBe(false);

    const createdWorkspace = await request(app)
      .post("/api/v1/workspaces/onboard")
      .set("Cookie", customerCookie)
      .send({
        name: "Funnel Coaching Centre",
        slug: `funnel-workspace-${suffix}`,
        phone: "01700000000"
      })
      .expect(201);
    workspaceId = createdWorkspace.body.data.id;

    expect(
      (await pool.query("SELECT workspace_id FROM workspace_settings WHERE workspace_id = $1", [workspaceId])).rowCount
    ).toBe(1);
    expect(
      (await pool.query("SELECT role_code FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [workspaceId, customerId]))
        .rows
    ).toEqual([{ role_code: 101 }]);
    expect((await onboardingState()).body.data.step).toBe("workspace_created");

    // Workspace activation is a Platform Owner lifecycle concern; checkout starts once it is active.
    await pool.query("UPDATE workspaces SET status = 'active' WHERE id = $1", [workspaceId]);
    expect((await onboardingState()).body.data.step).toBe("subscription_required");

    const inactivePlan = await submitPayment(`INACTIVE-${suffix}`, inactivePlanId, "99000").expect(400);
    expect(inactivePlan.body.error.code).toBe("PAYMENT_PLAN_NOT_PURCHASABLE");

    const rejectedTransactionId = `REJECT-${suffix}`;
    const submitted = await submitPayment(rejectedTransactionId).expect(201);
    expect(submitted.body.data).toMatchObject({
      planId: activePlanId,
      amountMinor: "125050",
      transactionId: rejectedTransactionId,
      status: "pending"
    });
    const duplicate = await submitPayment(rejectedTransactionId).expect(409);
    expect(duplicate.body.error.code).toBe("PAYMENT_TRANSACTION_ALREADY_EXISTS");
    expect((await onboardingState()).body.data.step).toBe("payment_pending");
    expect((await onboardingState()).body.data.step).toBe("payment_pending");
    expect((await latestPayment()).body.data).toMatchObject({ transactionId: rejectedTransactionId, status: "pending" });

    await request(app).get("/api/v1/plans").set("Cookie", platformOwnerCookie).expect(200);
    await request(app).get("/api/v1/plans").set("Cookie", customerCookie).expect(403);
    await request(app)
      .post(`/api/v1/payment-requests/${submitted.body.data.id}/reject`)
      .set("Cookie", platformOwnerCookie)
      .send({ rejectionReason: "Transaction details could not be verified." })
      .expect(200);
    expect((await latestPayment()).body.data).toMatchObject({
      transactionId: rejectedTransactionId,
      status: "rejected",
      rejectionReason: "Transaction details could not be verified."
    });
    expect((await onboardingState()).body.data.step).toBe("subscription_required");

    const approvedTransactionId = `APPROVE-${suffix}`;
    const replacement = await submitPayment(approvedTransactionId).expect(201);
    expect((await onboardingState()).body.data.step).toBe("payment_pending");
    await request(app)
      .post(`/api/v1/payment-requests/${replacement.body.data.id}/approve`)
      .set("Cookie", platformOwnerCookie)
      .send({})
      .expect(200);

    expect((await latestPayment()).body.data).toMatchObject({ transactionId: approvedTransactionId, status: "approved" });
    expect((await onboardingState()).body.data.step).toBe("ready");
    expect((await onboardingState()).body.data.step).toBe("ready");
  });

  it("rejects unauthenticated and stale-workspace access without exposing customer data", async () => {
    await request(app)
      .get("/api/v1/workspaces/onboarding-state")
      .set("X-Workspace-Id", workspaceId)
      .expect(401);
    await request(app)
      .post("/api/v1/payment-requests")
      .set("X-Workspace-Id", workspaceId)
      .send({
        planId: activePlanId,
        amount: "125050",
        paymentMethod: "bkash",
        senderNumber: "01700000000",
        transactionId: `UNAUTHENTICATED-${suffix}`
      })
      .expect(401);
    const staleWorkspace = await onboardingState(randomUUID()).expect(403);
    expect(staleWorkspace.body.error.code).toBe("WORKSPACE_MEMBERSHIP_REQUIRED");
  });
});
