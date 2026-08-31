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
const membershipId = randomUUID();
const planId = randomUUID();
const email = `payment-api-${suffix}@example.test`;

describe("payment submission API", () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    const signUp = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ name: "Payment User", email, password: "safe-test-password" })
      .expect(200);
    userId = signUp.body.user.id;
    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: "safe-test-password" })
      .expect(200);
    cookie = signIn.headers["set-cookie"]?.[0];
    await pool.query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)", [
      workspaceId,
      "Payment API Workspace",
      `payment-api-${suffix}`
    ]);
    await pool.query("INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, 101)", [
      membershipId,
      workspaceId,
      userId
    ]);
    await pool.query("INSERT INTO plans (id, name, slug, price_minor, duration_days, trial_days) VALUES ($1, $2, $3, 125050, 30, 0)", [
      planId,
      "API Plan",
      `api-plan-${suffix}`
    ]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspace_members WHERE id = $1", [membershipId]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  const endpoint = () =>
    request(app).post("/api/v1/payment-requests").set("Cookie", cookie).set("X-Workspace-Id", workspaceId);
  const body = (transactionId = `API-${suffix}-${randomUUID()}`) => ({
    planId,
    amount: 125050,
    paymentMethod: "bkash",
    senderNumber: "01700000000",
    transactionId
  });

  it("creates a pending subscription payment", async () => {
    const response = await endpoint().send(body()).expect(201);
    expect(response.body.data).toMatchObject({
      planId,
      paymentMethod: "bkash",
      status: "pending"
    });
    expect(response.body.data).not.toHaveProperty("reviewedAt");
  });

  it("returns the latest subscription payment to a workspace member", async () => {
    const response = await request(app)
      .get("/api/v1/payment-requests/latest")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", workspaceId)
      .expect(200);

    expect(response.body.data).toMatchObject({
      planId,
      paymentMethod: "bkash",
      amountMinor: "125050",
      status: "pending"
    });
    expect(response.body.data).toHaveProperty("createdAt");
  });

  it("rejects invalid bodies with 400", async () => {
    await endpoint()
      .send({ ...body(), amount: -1 })
      .expect(400);
    await endpoint()
      .send({ ...body(), status: "approved" })
      .expect(400);
    await endpoint()
      .send({ ...body(), workspaceId })
      .expect(400);
  });

  it("rejects duplicate transaction IDs", async () => {
    const transactionId = `DUP-API-${suffix}`;
    await endpoint().send(body(transactionId)).expect(201);
    const response = await endpoint().send(body(transactionId)).expect(409);
    expect(response.body.error.code).toBe("PAYMENT_TRANSACTION_ALREADY_EXISTS");
  });

  it("denies unauthenticated and non-member callers", async () => {
    await request(app).post("/api/v1/payment-requests").set("X-Workspace-Id", workspaceId).send(body()).expect(401);
    await request(app).get("/api/v1/payment-requests/latest").set("X-Workspace-Id", workspaceId).expect(401);
    await request(app)
      .post("/api/v1/payment-requests")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", randomUUID())
      .send(body())
      .expect(403);
    await request(app)
      .get("/api/v1/payment-requests/latest")
      .set("Cookie", cookie)
      .set("X-Workspace-Id", randomUUID())
      .expect(403);
  });
});
