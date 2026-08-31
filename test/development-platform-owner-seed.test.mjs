import { createRequire } from "node:module";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { pool } = require("../dist/backend/src/database/client.js");
const {
  DEVELOPMENT_PLATFORM_OWNER,
  seedDevelopmentPlatformOwner
} = require("../dist/backend/src/database/seed/development-platform-owner.js");

describe("development Platform Owner seed", () => {
  const app = createApp();

  afterAll(async () => {
    await pool.end();
  });

  it("does not create the development account outside development", async () => {
    const before = await pool.query('SELECT id FROM "user" WHERE email = $1', [DEVELOPMENT_PLATFORM_OWNER.email]);
    const seeded = await seedDevelopmentPlatformOwner("production");
    const after = await pool.query('SELECT id FROM "user" WHERE email = $1', [DEVELOPMENT_PLATFORM_OWNER.email]);

    expect(seeded).toBe(false);
    expect(after.rows).toEqual(before.rows);
  });

  it("creates an idempotent Better Auth Platform Owner that can sign in", async () => {
    await seedDevelopmentPlatformOwner("development");
    await seedDevelopmentPlatformOwner("development");

    const users = await pool.query('SELECT id FROM "user" WHERE email = $1', [DEVELOPMENT_PLATFORM_OWNER.email]);
    expect(users.rowCount).toBe(1);

    const owners = await pool.query("SELECT user_id FROM platform_owners");
    expect(owners.rows).toEqual([{ user_id: users.rows[0].id }]);

    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: DEVELOPMENT_PLATFORM_OWNER.email, password: DEVELOPMENT_PLATFORM_OWNER.password })
      .expect(200);
    const cookie = signIn.headers["set-cookie"]?.[0];

    await request(app).get("/api/v1/plans").set("Cookie", cookie).expect(200);
  });
});
