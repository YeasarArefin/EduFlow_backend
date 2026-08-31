import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { env } = require("../dist/backend/src/config/env.js");
const { requireWorkspaceSubscriptionAccess } = require("../dist/backend/src/middleware/require-subscription-access.js");
const { requireFeatureEntitlement } = require("../dist/backend/src/middleware/require-feature-entitlement.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const workspaceId = randomUUID();
const planId = randomUUID();
const featureKey = `guard-feature-${Date.now()}`;

async function query(text, values = []) {
  return pool.query(text, values);
}
function response() {
  const result = { statusCode: null, body: null };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    }
  };
}
async function run(middleware, req) {
  const res = response();
  let called = false;
  await middleware(req, res, () => {
    called = true;
  });
  return { ...res.result, called };
}

describe("subscription entitlement guards", () => {
  beforeAll(async () => {
    await query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active')", [
      workspaceId,
      "Guard Workspace",
      `guard-${Date.now()}`
    ]);
    await query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [
      planId,
      "Guard Plan",
      `guard-plan-${Date.now()}`
    ]);
    await query("INSERT INTO features (key, name) VALUES ($1, $2)", [featureKey, "Guard Feature"]);
    await query("INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, $2, true, 10)", [
      planId,
      featureKey
    ]);
    await query(
      "INSERT INTO subscriptions (workspace_id, plan_id, status, expires_at) VALUES ($1, $2, 'active', now() + interval '1 day')",
      [workspaceId, planId]
    );
  });
  afterAll(async () => {
    await query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM workspace_entitlement_overrides WHERE workspace_id = $1", [workspaceId]);
    await query("DELETE FROM plan_features WHERE plan_id = $1", [planId]);
    await query("DELETE FROM features WHERE key = $1", [featureKey]);
    await query("DELETE FROM plans WHERE id = $1", [planId]);
    await query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.end();
  });

  it("allows active and entitled workspaces", async () => {
    const req = { workspaceContext: { workspaceId } };
    expect((await run(requireWorkspaceSubscriptionAccess, req)).called).toBe(true);
    expect((await run(requireFeatureEntitlement(featureKey), req)).called).toBe(true);
  });
  it("blocks a disallowed subscription with 403", async () => {
    await query("UPDATE subscriptions SET status = 'expired' WHERE workspace_id = $1", [workspaceId]);
    const result = await run(requireWorkspaceSubscriptionAccess, {
      workspaceContext: { workspaceId }
    });
    expect(result).toMatchObject({
      called: false,
      statusCode: 403,
      body: { error: { code: "SUBSCRIPTION_ACCESS_REQUIRED" } }
    });
    await query("UPDATE subscriptions SET status = 'active' WHERE workspace_id = $1", [workspaceId]);
  });
  it("blocks missing and disabled feature entitlements with 403", async () => {
    const req = { workspaceContext: { workspaceId } };
    expect((await run(requireFeatureEntitlement("missing-feature"), req)).statusCode).toBe(403);
    await query(
      "INSERT INTO workspace_entitlement_overrides (workspace_id, feature_key, enabled_override, reason) VALUES ($1, $2, false, 'test')",
      [workspaceId, featureKey]
    );
    expect((await run(requireFeatureEntitlement(featureKey), req)).statusCode).toBe(403);
  });
});
