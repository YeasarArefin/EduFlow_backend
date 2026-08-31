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
const secondPlanId = randomUUID();
const featureKey = `subscription-feature-${suffix}`;
const secondFeatureKey = `subscription-feature-2-${suffix}`;

async function query(text, values = []) {
  return pool.query(text, values);
}

describe("Phase 3.2 subscription PostgreSQL constraints", () => {
  beforeAll(async () => {
    await query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)", [
      workspaceId,
      "Subscription Test Workspace",
      `subscription-${suffix}`
    ]);
    await query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, $4, $5)", [
      planId,
      "Test Plan",
      `plan-${suffix}`,
      30,
      14
    ]);
    await query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, $4, $5)", [
      secondPlanId,
      "Second Plan",
      `plan-2-${suffix}`,
      30,
      0
    ]);
    await query("INSERT INTO features (key, name) VALUES ($1, $2), ($3, $4)", [
      featureKey,
      "Test Feature",
      secondFeatureKey,
      "Second Feature"
    ]);
  });

  afterAll(async () => {
    await query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM workspace_entitlement_overrides WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM workspace_settings WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM plan_features WHERE plan_id IN ($1, $2)", [planId, secondPlanId]);
    await query("DELETE FROM features WHERE key IN ($1, $2)", [featureKey, secondFeatureKey]);
    await query("DELETE FROM plans WHERE id IN ($1, $2)", [planId, secondPlanId]);
    await query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.end();
  });

  it("enforces required plan fields and unique plan slugs", async () => {
    await expect(
      query("INSERT INTO plans (name, slug, duration_days, trial_days) VALUES ($1, $2, $3, $4)", [
        "Duplicate",
        `plan-${suffix}`,
        30,
        0
      ])
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      query("INSERT INTO plans (slug, duration_days, trial_days) VALUES ($1, $2, $3)", [
        `missing-name-${suffix}`,
        30,
        0
      ])
    ).rejects.toMatchObject({ code: "23502" });
  });

  it("enforces feature key uniqueness", async () => {
    await expect(
      query("INSERT INTO features (key, name) VALUES ($1, $2)", [featureKey, "Duplicate"])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces plan-feature composite uniqueness", async () => {
    await query("INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, $2, $3, $4)", [
      planId,
      featureKey,
      true,
      100
    ]);
    await expect(
      query("INSERT INTO plan_features (plan_id, feature_key) VALUES ($1, $2)", [planId, featureKey])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows one current subscription and preserves historical subscriptions", async () => {
    await query("INSERT INTO subscriptions (workspace_id, plan_id, status) VALUES ($1, $2, $3)", [
      workspaceId,
      planId,
      "active"
    ]);
    await expect(
      query("INSERT INTO subscriptions (workspace_id, plan_id, status) VALUES ($1, $2, $3)", [
        workspaceId,
        secondPlanId,
        "trial"
      ])
    ).rejects.toMatchObject({ code: "23505" });
    await query("INSERT INTO subscriptions (workspace_id, plan_id, status) VALUES ($1, $2, $3)", [
      workspaceId,
      secondPlanId,
      "expired"
    ]);
  });

  it("enforces workspace override uniqueness", async () => {
    await query("INSERT INTO workspace_entitlement_overrides (workspace_id, feature_key, reason) VALUES ($1, $2, $3)", [
      workspaceId,
      featureKey,
      "test override"
    ]);
    await expect(
      query("INSERT INTO workspace_entitlement_overrides (workspace_id, feature_key, reason) VALUES ($1, $2, $3)", [
        workspaceId,
        featureKey,
        "duplicate"
      ])
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects invalid workspace, plan, and feature references", async () => {
    const missingWorkspace = "00000000-0000-4000-8100-000000000099";
    const missingPlan = "00000000-0000-4000-8100-000000000098";
    await expect(
      query("INSERT INTO subscriptions (workspace_id, plan_id, status) VALUES ($1, $2, $3)", [
        missingWorkspace,
        planId,
        "active"
      ])
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      query("INSERT INTO subscriptions (workspace_id, plan_id, status) VALUES ($1, $2, $3)", [
        workspaceId,
        missingPlan,
        "expired"
      ])
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      query("INSERT INTO plan_features (plan_id, feature_key) VALUES ($1, $2)", [planId, "missing-feature"])
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects negative prices, durations, and quotas", async () => {
    await expect(
      query("INSERT INTO plans (name, slug, price_minor, duration_days, trial_days) VALUES ($1, $2, $3, $4, $5)", [
        "Negative Price",
        `negative-price-${suffix}`,
        -1,
        30,
        0
      ])
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      query("INSERT INTO plans (name, slug, duration_days, trial_days) VALUES ($1, $2, $3, $4)", [
        "Negative Duration",
        `negative-duration-${suffix}`,
        -1,
        0
      ])
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      query("INSERT INTO plan_features (plan_id, feature_key, limit_value) VALUES ($1, $2, $3)", [
        secondPlanId,
        secondFeatureKey,
        -1
      ])
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      query(
        "INSERT INTO workspace_entitlement_overrides (workspace_id, feature_key, limit_override, reason) VALUES ($1, $2, $3, $4)",
        [workspaceId, secondFeatureKey, -1, "negative"]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });
});
