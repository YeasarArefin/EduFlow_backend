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
const activePlanId = randomUUID();
const inactivePlanId = randomUUID();
const featureKey = `public-feature-${suffix}`;
const disabledFeatureKey = `public-disabled-${suffix}`;

describe("public active plans API", () => {
  beforeAll(async () => {
    await pool.query("INSERT INTO features (key, name, description) VALUES ($1, $2, $3), ($4, $5, $6)", [
      featureKey,
      "Student capacity",
      "Keep student records organized.",
      disabledFeatureKey,
      "Hidden capability",
      "Not included in this plan."
    ]);
    await pool.query(
      "INSERT INTO plans (id, name, slug, price_minor, duration_days, trial_days, is_active) VALUES ($1, $2, $3, $4, $5, $6, true), ($7, $8, $9, $10, $11, $12, false)",
      [activePlanId, "Public Starter", `public-starter-${suffix}`, "123456789012345", 30, 7, inactivePlanId, "Hidden Plan", `hidden-${suffix}`, "999", 30, 0]
    );
    await pool.query(
      "INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, $2, true, $3), ($1, $4, false, $5)",
      [activePlanId, featureKey, "250", disabledFeatureKey, "999"]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM plan_features WHERE plan_id IN ($1, $2)", [activePlanId, inactivePlanId]);
    await pool.query("DELETE FROM plans WHERE id IN ($1, $2)", [activePlanId, inactivePlanId]);
    await pool.query("DELETE FROM features WHERE key IN ($1, $2)", [featureKey, disabledFeatureKey]);
    await pool.end();
  });

  it("returns only active public plans without authentication", async () => {
    const response = await request(app).get("/api/v1/public/plans").expect(200);
    const activePlan = response.body.data.find((plan) => plan.id === activePlanId);
    expect(activePlan).toMatchObject({
      id: activePlanId,
      name: "Public Starter",
      slug: `public-starter-${suffix}`,
      priceMinor: "123456789012345",
      durationDays: 30,
      trial: { included: true, days: 7 },
      features: [{ key: featureKey, name: "Student capacity", defaultLimit: "250" }],
      quotas: { [featureKey]: "250" }
    });
    expect(response.body.data.some((plan) => plan.id === inactivePlanId)).toBe(false);
    expect(activePlan).not.toHaveProperty("isActive");
    expect(activePlan).not.toHaveProperty("createdAt");
    expect(activePlan).not.toHaveProperty("updatedAt");
  });
});
