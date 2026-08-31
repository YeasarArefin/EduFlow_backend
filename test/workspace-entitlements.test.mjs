import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { env } = require("../dist/backend/src/config/env.js");
const { resolveWorkspaceEntitlements } = require("../dist/backend/src/services/workspace-entitlements.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const workspaceId = randomUUID();
const planId = randomUUID();
const featureKey = `resolver-feature-${Date.now()}`;
const overriddenFeatureKey = `resolver-overridden-${Date.now()}`;

async function query(text, values = []) {
  return pool.query(text, values);
}

describe("workspace entitlement resolver", () => {
  beforeAll(async () => {
    await query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)", [workspaceId, "Resolver Workspace", `resolver-${Date.now()}`]);
    await query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, $4, $5)", [planId, "Resolver Plan", `resolver-plan-${Date.now()}`, 30, 0]);
    await query("INSERT INTO features (key, name) VALUES ($1, $2), ($3, $4)", [featureKey, "Default Feature", overriddenFeatureKey, "Overridden Feature"]);
    await query("INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)", [planId, featureKey, true, 100, overriddenFeatureKey, true, 25]);
    await query("INSERT INTO subscriptions (workspace_id, plan_id, status) VALUES ($1, $2, $3)", [workspaceId, planId, "active"]);
  });

  afterAll(async () => {
    await query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM workspace_entitlement_overrides WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM plan_features WHERE plan_id = $1", [planId]);
    await query("DELETE FROM features WHERE key IN ($1, $2)", [featureKey, overriddenFeatureKey]);
    await query("DELETE FROM plans WHERE id = $1", [planId]);
    await query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.end();
  });

  it("resolves plan defaults", async () => {
    const result = await resolveWorkspaceEntitlements(workspaceId);
    expect(result.subscription.status).toBe("active");
    expect(result.entitlements[featureKey]).toEqual({ enabled: true, limit: 100n });
  });

  it("applies an override after plan defaults", async () => {
    await query("INSERT INTO workspace_entitlement_overrides (workspace_id, feature_key, enabled_override, limit_override, reason) VALUES ($1, $2, $3, $4, $5)", [workspaceId, overriddenFeatureKey, false, 250, "resolver test"]);
    const result = await resolveWorkspaceEntitlements(workspaceId);
    expect(result.entitlements[overriddenFeatureKey]).toEqual({ enabled: false, limit: 250n });
  });

  it("handles a workspace with no current subscription explicitly", async () => {
    const missingSubscriptionWorkspaceId = randomUUID();
    await query("INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)", [missingSubscriptionWorkspaceId, "No Subscription Workspace", `no-subscription-${Date.now()}`]);
    try {
      await expect(resolveWorkspaceEntitlements(missingSubscriptionWorkspaceId)).resolves.toEqual({
        workspaceId: missingSubscriptionWorkspaceId,
        subscription: null,
        entitlements: {},
      });
    } finally {
      await query("DELETE FROM workspaces WHERE id = $1", [missingSubscriptionWorkspaceId]);
    }
  });
});
