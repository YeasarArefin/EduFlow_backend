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
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const planId = randomUUID();
const ownerEmail = `student-owner-${suffix}@example.test`;
const restrictedEmail = `student-restricted-${suffix}@example.test`;
let ownerCookie;
let restrictedCookie;
let ownerId;
let restrictedId;
let createdStudentId;
let workspaceBStudentId;

const headers = (workspaceId = workspaceA) => ({ Cookie: ownerCookie, "X-Workspace-Id": workspaceId });
const student = (overrides = {}) => ({
  studentCode: `STD-${suffix}-${randomUUID().slice(0, 6)}`,
  fullName: "Amina Rahman",
  phone: "01712345678",
  guardianName: "Karim Rahman",
  guardianPhone: "01812345678",
  gender: "female",
  admissionDate: "2026-09-04",
  ...overrides
});

describe("student API", () => {
  beforeAll(async () => {
    const ownerSignup = await request(app).post("/api/auth/sign-up/email").send({ name: "Student Owner", email: ownerEmail, password: "safe-test-password" }).expect(200);
    ownerId = ownerSignup.body.user.id;
    const ownerSignin = await request(app).post("/api/auth/sign-in/email").send({ email: ownerEmail, password: "safe-test-password" }).expect(200);
    ownerCookie = ownerSignin.headers["set-cookie"]?.[0];
    const restrictedSignup = await request(app).post("/api/auth/sign-up/email").send({ name: "Restricted Student User", email: restrictedEmail, password: "safe-test-password" }).expect(200);
    restrictedId = restrictedSignup.body.user.id;
    const restrictedSignin = await request(app).post("/api/auth/sign-in/email").send({ email: restrictedEmail, password: "safe-test-password" }).expect(200);
    restrictedCookie = restrictedSignin.headers["set-cookie"]?.[0];

    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [planId, "Student API Plan", `student-api-plan-${suffix}`]);
    await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $6, 'active')", [workspaceA, "Student Workspace A", `students-a-${suffix}`, workspaceB, "Student Workspace B", `students-b-${suffix}`]);
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101), ($1, $3, 201)", [workspaceA, ownerId, restrictedId]);
    await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days')", [workspaceA, planId]);
    const other = await pool.query("INSERT INTO students (workspace_id, student_code, full_name) VALUES ($1, $2, $3) RETURNING id", [workspaceB, "SHARED-CODE", "Workspace B Student"]);
    workspaceBStudentId = other.rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM audit_logs WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM students WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [ownerId, restrictedId]);
    await pool.end();
  });

  it("creates, reads, updates, and archives a workspace student", async () => {
    const created = await request(app).post("/api/v1/students").set(headers()).send(student({ studentCode: "SHARED-CODE" })).expect(201);
    createdStudentId = created.body.data.id;
    expect(created.body.data).toMatchObject({ studentCode: "SHARED-CODE", fullName: "Amina Rahman", status: "active" });

    await request(app).get(`/api/v1/students/${createdStudentId}`).set(headers()).expect(200).expect(({ body }) => expect(body.data.id).toBe(createdStudentId));
    await request(app).patch(`/api/v1/students/${createdStudentId}`).set(headers()).send({ fullName: "Amina Sultana", status: "inactive" }).expect(200).expect(({ body }) => expect(body.data).toMatchObject({ fullName: "Amina Sultana", status: "inactive" }));
    await request(app).delete(`/api/v1/students/${createdStudentId}`).set(headers()).expect(200).expect(({ body }) => expect(body.data.status).toBe("archived"));
  });

  it("paginates and filters list results server-side", async () => {
    await request(app).post("/api/v1/students").set(headers()).send(student({ studentCode: "FIND-AMINA", fullName: "Amina Search", status: "active" })).expect(201);
    await request(app).post("/api/v1/students").set(headers()).send(student({ studentCode: "FIND-RAHIM", fullName: "Rahim Search", status: "inactive" })).expect(201);

    const active = await request(app).get("/api/v1/students?page=1&limit=1&search=Amina&status=active").set(headers()).expect(200);
    expect(active.body.meta).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0]).toMatchObject({ studentCode: "FIND-AMINA", status: "active" });
  });

  it("rejects duplicate codes in one workspace and malformed input", async () => {
    await request(app).post("/api/v1/students").set(headers()).send(student({ studentCode: "DUPLICATE-CODE" })).expect(201);
    const duplicate = await request(app).post("/api/v1/students").set(headers()).send(student({ studentCode: "DUPLICATE-CODE" })).expect(409);
    expect(duplicate.body.error.code).toBe("STUDENT_CODE_ALREADY_EXISTS");
    await request(app).post("/api/v1/students").set(headers()).send({ studentCode: "BAD", fullName: "Bad Phone", phone: "123" }).expect(400);
  });

  it("rejects unauthenticated, permissionless, and cross-workspace access", async () => {
    await request(app).get("/api/v1/students").set("X-Workspace-Id", workspaceA).expect(401);
    await request(app).get("/api/v1/students").set({ Cookie: restrictedCookie, "X-Workspace-Id": workspaceA }).expect(403).expect(({ body }) => expect(body.error.code).toBe("PERMISSION_REQUIRED"));
    await request(app).get("/api/v1/students").set(headers(workspaceB)).expect(403).expect(({ body }) => expect(body.error.code).toBe("WORKSPACE_MEMBERSHIP_REQUIRED"));
    await request(app).get(`/api/v1/students/${workspaceBStudentId}`).set(headers()).expect(404);
    await request(app).patch(`/api/v1/students/${workspaceBStudentId}`).set(headers()).send({ fullName: "Cross workspace" }).expect(404);
    await request(app).delete(`/api/v1/students/${workspaceBStudentId}`).set(headers()).expect(404);
  });
});
