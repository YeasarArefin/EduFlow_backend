import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assignPlatformOwner, restorePlatformOwner } from "./support/platform-owner-fixture.mjs";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const planId = randomUUID();
const customerEmail = `saas-funnel-${suffix}@example.test`;
const ownerEmail = `saas-owner-${suffix}@example.test`;

describe("account-first SaaS funnel", () => {
  let customerId;
  let customerCookie;
  let ownerId;
  let ownerCookie;
  let workspaceId;
  let platformOwnerFixture;
  const accountState = (cookie = customerCookie) => request(app).get("/api/v1/account/state").set("Cookie", cookie);
  const submitPayment = (transactionId) => request(app).post("/api/v1/payment-requests/account").set("Cookie", customerCookie).send({ planId, amount: "125050", paymentMethod: "bkash", senderNumber: "01700000000", transactionId });

  beforeAll(async () => {
    await pool.query("INSERT INTO plans (id, name, slug, price_minor, duration_days, trial_days, is_active) VALUES ($1, $2, $3, 125050, 30, 0, true)", [planId, "Funnel Plan", `funnel-plan-${suffix}`]);
    for (const [email, name] of [[customerEmail, "SaaS Customer"], [ownerEmail, "Platform Owner"]]) await request(app).post("/api/auth/sign-up/email").send({ name, email, password: "safe-test-password" }).expect(200);
    customerId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [customerEmail])).rows[0].id;
    ownerId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [ownerEmail])).rows[0].id;
    customerCookie = (await request(app).post("/api/auth/sign-in/email").send({ email: customerEmail, password: "safe-test-password" }).expect(200)).headers["set-cookie"]?.[0];
    ownerCookie = (await request(app).post("/api/auth/sign-in/email").send({ email: ownerEmail, password: "safe-test-password" }).expect(200)).headers["set-cookie"]?.[0];
    platformOwnerFixture = await assignPlatformOwner(pool, ownerId);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM audit_logs WHERE actor_user_id IN ($1, $2) OR workspace_id = $3", [customerId, ownerId, workspaceId ?? null]);
    await pool.query("DELETE FROM payment_requests WHERE requested_by_user_id = $1", [customerId]);
    if (workspaceId) {
      await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_settings WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    }
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await restorePlatformOwner(pool, platformOwnerFixture);
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [customerId, ownerId]);
    await pool.end();
  });

  it("routes from database state through rejection, approval, creation, and another browser", async () => {
    expect((await accountState().expect(200)).body.data).toEqual({ route: "account" });
    const rejected = await submitPayment(`REJECT-${suffix}`).expect(201);
    expect((await accountState().expect(200)).body.data).toEqual({ route: "payment_pending" });
    await request(app).post(`/api/v1/payment-requests/${rejected.body.data.id}/reject`).set("Cookie", ownerCookie).send({ rejectionReason: "Could not verify transaction" }).expect(200);
    expect((await accountState().expect(200)).body.data).toEqual({ route: "account" });
    const approved = await submitPayment(`APPROVE-${suffix}`).expect(201);
    await request(app).post(`/api/v1/payment-requests/${approved.body.data.id}/approve`).set("Cookie", ownerCookie).send({}).expect(200);
    expect((await accountState().expect(200)).body.data).toEqual({ route: "workspace_creation" });
    const created = await request(app).post("/api/v1/workspaces/onboard").set("Cookie", customerCookie).send({ name: "Funnel Coaching Centre", slug: `funnel-workspace-${suffix}` }).expect(201);
    workspaceId = created.body.data.id;
    expect((await accountState().expect(200)).body.data).toEqual({ route: "dashboard", workspaceId });
    const secondBrowserCookie = (await request(app).post("/api/auth/sign-in/email").send({ email: customerEmail, password: "safe-test-password" }).expect(200)).headers["set-cookie"]?.[0];
    expect((await accountState(secondBrowserCookie).expect(200)).body.data).toEqual({ route: "dashboard", workspaceId });
    expect((await request(app).post("/api/v1/workspaces/onboard").set("Cookie", secondBrowserCookie).send({ name: "Second", slug: `second-${suffix}` }).expect(409)).body.error.code).toBe("WORKSPACE_ALREADY_EXISTS");
  });
});
