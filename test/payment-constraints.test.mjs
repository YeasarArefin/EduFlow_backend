import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { env } = require("../dist/backend/src/config/env.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceId = randomUUID();
const planId = randomUUID();
const missingId = "00000000-0000-4000-8100-000000000099";

async function query(text, values = []) {
  return pool.query(text, values);
}

function paymentValues(overrides = {}) {
  return {
    workspaceId,
    planId,
    amountMinor: 125050,
    method: "bkash",
    senderNumber: "01700000000",
    transactionId: `TX-${suffix}-${randomUUID()}`,
    status: "pending",
    reviewedAt: null,
    ...overrides
  };
}

async function insertPayment(overrides = {}) {
  const values = paymentValues(overrides);
  return query(
    `INSERT INTO payment_requests
      (workspace_id, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id, status, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      values.workspaceId,
      values.planId,
      values.amountMinor,
      values.method,
      values.senderNumber,
      values.transactionId,
      values.status,
      values.reviewedAt
    ]
  );
}

describe("Phase 4.2 payment PostgreSQL constraints", () => {
  beforeAll(async () => {
    await query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)", [
      workspaceId,
      "Payment Test Workspace",
      `payment-${suffix}`
    ]);
    await query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, $4, $5)", [
      planId,
      "Payment Plan",
      `payment-plan-${suffix}`,
      30,
      0
    ]);
  });

  afterAll(async () => {
    await query("DELETE FROM payment_requests WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM plans WHERE id = $1", [planId]);
    await query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.end();
  });

  it("accepts valid workspace and plan foreign keys", async () => {
    await expect(insertPayment()).resolves.toBeDefined();
    await expect(insertPayment({ workspaceId: missingId })).rejects.toMatchObject({ code: "23503" });
    await expect(insertPayment({ planId: missingId })).rejects.toMatchObject({
      code: "23503"
    });
  });

  it("enforces transaction ID uniqueness", async () => {
    const transactionId = `DUP-${suffix}`;
    await insertPayment({ transactionId });
    await expect(insertPayment({ transactionId })).rejects.toMatchObject({
      code: "23505"
    });
  });

  it("rejects negative amounts", async () => {
    await expect(insertPayment({ amountMinor: -1 })).rejects.toMatchObject({
      code: "23514"
    });
  });

  it("accepts valid payment and review states and rejects invalid enum values", async () => {
    await expect(insertPayment({ status: "approved", reviewedAt: new Date() })).resolves.toBeDefined();
    await expect(insertPayment({ status: "rejected", reviewedAt: new Date() })).resolves.toBeDefined();
    await expect(insertPayment({ method: "nagad" })).resolves.toBeDefined();
    await expect(insertPayment({ status: "reviewing" })).rejects.toMatchObject({
      code: "22P02"
    });
    await expect(insertPayment({ method: "card" })).rejects.toMatchObject({
      code: "22P02"
    });
  });

  it("requires a plan for subscription payments", async () => {
    await expect(insertPayment({ planId: null })).rejects.toMatchObject({
      code: "23514"
    });
  });

  it("prevents pending rows from containing completed review data", async () => {
    await expect(insertPayment({ status: "pending", reviewedAt: new Date() })).rejects.toMatchObject({ code: "23514" });
  });

  it("requires reviewed timestamps for reviewed rows", async () => {
    await expect(insertPayment({ status: "approved", reviewedAt: null })).rejects.toMatchObject({ code: "23514" });
    await expect(insertPayment({ status: "rejected", reviewedAt: null })).rejects.toMatchObject({ code: "23514" });
  });
});
