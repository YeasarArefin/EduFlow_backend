import request from "supertest";
import pg from "pg";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `workspace-onboarding-${suffix}@example.test`;

describe("workspace onboarding API", () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    const signUp = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ name: "Workspace Onboarding User", email, password: "safe-test-password" })
      .expect(200);
    userId = signUp.body.user.id;

    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: "safe-test-password" })
      .expect(200);
    cookie = signIn.headers["set-cookie"]?.[0];
  });

  afterAll(async () => {
    await pool.query(
      "DELETE FROM workspace_settings WHERE workspace_id IN (SELECT id FROM workspaces WHERE created_by_user_id = $1)",
      [userId]
    );
    await pool.query(
      "DELETE FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE created_by_user_id = $1)",
      [userId]
    );
    await pool.query("DELETE FROM workspaces WHERE created_by_user_id = $1", [userId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  const endpoint = () => request(app).post("/api/v1/workspaces/onboard").set("Cookie", cookie);
  const body = (slug = `onboarding-${suffix}`) => ({
    name: "Onboarding Coaching Centre",
    slug,
    phone: "01700000000",
    email: "hello@onboarding.test",
    address: "Dhaka"
  });

  it("creates an authenticated workspace in the pending onboarding state", async () => {
    const workspaceSlug = `created-${suffix}`;
    const response = await endpoint().send(body(workspaceSlug)).expect(201);

    expect(response.body.data).toMatchObject({
      name: "Onboarding Coaching Centre",
      slug: workspaceSlug,
      phone: "01700000000",
      email: "hello@onboarding.test",
      address: "Dhaka",
      status: "pending"
    });
    expect(response.body.data.id).toEqual(expect.any(String));

    const settings = await pool.query("SELECT workspace_id FROM workspace_settings WHERE workspace_id = $1", [
      response.body.data.id
    ]);
    expect(settings.rowCount).toBe(1);

    const membership = await pool.query(
      "SELECT user_id, role_code FROM workspace_members WHERE workspace_id = $1",
      [response.body.data.id]
    );
    expect(membership.rows).toEqual([{ user_id: userId, role_code: 101 }]);
  });

  it("rejects a duplicate slug with 409", async () => {
    const workspaceSlug = `duplicate-${suffix}`;
    await endpoint().send(body(workspaceSlug)).expect(201);

    const response = await endpoint().send(body(workspaceSlug)).expect(409);
    expect(response.body.error.code).toBe("WORKSPACE_SLUG_ALREADY_EXISTS");
  });

  it("rejects invalid request bodies", async () => {
    await endpoint().send({ ...body(), slug: "Invalid Slug" }).expect(400);
    await endpoint().send({ ...body(), status: "active" }).expect(400);
  });

  it("requires an authenticated session", async () => {
    const response = await request(app).post("/api/v1/workspaces/onboard").send(body()).expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rolls back workspace provisioning when settings creation fails", async () => {
    const functionName = `fail_workspace_settings_${suffix.replace(/-/g, "_")}`;
    const triggerName = `fail_workspace_settings_trigger_${suffix.replace(/-/g, "_")}`;
    const workspaceSlug = `rollback-${suffix}`;

    await pool.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced settings failure'; END; $$`);
    await pool.query(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON workspace_settings FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
    );

    try {
      await endpoint().send(body(workspaceSlug)).expect(500);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON workspace_settings`);
      await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }

    const [workspace, settings, memberships] = await Promise.all([
      pool.query("SELECT id FROM workspaces WHERE slug = $1", [workspaceSlug]),
      pool.query(
        "SELECT settings.workspace_id FROM workspace_settings AS settings JOIN workspaces AS workspace ON workspace.id = settings.workspace_id WHERE workspace.slug = $1",
        [workspaceSlug]
      ),
      pool.query(
        "SELECT members.id FROM workspace_members AS members JOIN workspaces AS workspace ON workspace.id = members.workspace_id WHERE workspace.slug = $1",
        [workspaceSlug]
      )
    ]);

    expect(workspace.rowCount).toBe(0);
    expect(settings.rowCount).toBe(0);
    expect(memberships.rowCount).toBe(0);
  });
});
