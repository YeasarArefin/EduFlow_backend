import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const planId = randomUUID();
let userId, cookie, restrictedUserId, restrictedCookie, classLevelA, classLevelB, mediumA, academicGroupA, teacherA, teacherA2, teacherB, studentA, studentB, workspaceBBatchId;
const headers = (workspaceId = workspaceA) => ({ Cookie: cookie, "X-Workspace-Id": workspaceId });
const batch = (overrides = {}) => ({ name: `SSC Science ${suffix}`, classLevelId: classLevelA, mediumId: mediumA, academicGroupId: academicGroupA, startDate: "2026-10-01", monthlyFeeMinor: "125000", status: "active", ...overrides });

describe("batch API", () => {
  beforeAll(async () => {
    const signup = await request(app).post("/api/auth/sign-up/email").send({ name: "Batch Owner", email: `batch-owner-${suffix}@example.test`, password: "safe-test-password" }).expect(200);
    userId = signup.body.user.id;
    const signin = await request(app).post("/api/auth/sign-in/email").send({ email: `batch-owner-${suffix}@example.test`, password: "safe-test-password" }).expect(200);
    cookie = signin.headers["set-cookie"]?.[0];
    const restrictedSignup = await request(app).post("/api/auth/sign-up/email").send({ name: "Restricted Batch User", email: `batch-restricted-${suffix}@example.test`, password: "safe-test-password" }).expect(200);
    restrictedUserId = restrictedSignup.body.user.id;
    const restrictedSignin = await request(app).post("/api/auth/sign-in/email").send({ email: `batch-restricted-${suffix}@example.test`, password: "safe-test-password" }).expect(200);
    restrictedCookie = restrictedSignin.headers["set-cookie"]?.[0];
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)", [planId, "Batch API Plan", `batch-api-${suffix}`]);
    await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $6, 'active')", [workspaceA, "Batch Workspace A", `batches-a-${suffix}`, workspaceB, "Batch Workspace B", `batches-b-${suffix}`]);
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101), ($1, $3, 201)", [workspaceA, userId, restrictedUserId]);
    await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days')", [workspaceA, planId]);
    const references = await pool.query("INSERT INTO class_levels (workspace_id, name) VALUES ($1, 'Class 10'), ($2, 'Class 9') RETURNING id, workspace_id", [workspaceA, workspaceB]);
    classLevelA = references.rows.find((row) => row.workspace_id === workspaceA).id;
    classLevelB = references.rows.find((row) => row.workspace_id === workspaceB).id;
    mediumA = (await pool.query("INSERT INTO mediums (workspace_id, name) VALUES ($1, 'Bangla') RETURNING id", [workspaceA])).rows[0].id;
    academicGroupA = (await pool.query("INSERT INTO academic_groups (workspace_id, name) VALUES ($1, 'Science') RETURNING id", [workspaceA])).rows[0].id;
    const teacherRows = await pool.query("INSERT INTO teachers (workspace_id, teacher_code, name) VALUES ($1, 'T-001', 'Amina Rahman'), ($1, 'T-002', 'Kamal Hossain'), ($2, 'T-003', 'Other Teacher') RETURNING id, workspace_id, teacher_code", [workspaceA, workspaceB]);
    teacherA = teacherRows.rows.find((row) => row.teacher_code === "T-001").id;
    teacherA2 = teacherRows.rows.find((row) => row.teacher_code === "T-002").id;
    teacherB = teacherRows.rows.find((row) => row.workspace_id === workspaceB).id;
    const studentRows = await pool.query("INSERT INTO students (workspace_id, student_code, full_name, status) VALUES ($1, 'S-001', 'Rahim Uddin', 'active'), ($2, 'S-002', 'Karim Ali', 'active') RETURNING id, workspace_id", [workspaceA, workspaceB]);
    studentA = studentRows.rows.find((row) => row.workspace_id === workspaceA).id;
    studentB = studentRows.rows.find((row) => row.workspace_id === workspaceB).id;
    workspaceBBatchId = (await pool.query("INSERT INTO batches (workspace_id, name, class_level_id) VALUES ($1, 'Other Workspace Batch', $2) RETURNING id", [workspaceB, classLevelB])).rows[0].id;
  });
  afterAll(async () => {
    await pool.query("DELETE FROM audit_logs WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM batch_enrollments WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM batches WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM teachers WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM students WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM academic_groups WHERE workspace_id = $1", [workspaceA]);
    await pool.query("DELETE FROM mediums WHERE workspace_id = $1", [workspaceA]);
    await pool.query("DELETE FROM class_levels WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM subscriptions WHERE workspace_id = $1", [workspaceA]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceA]);
    await pool.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [userId, restrictedUserId]);
    await pool.end();
  });
  it("creates and updates a batch profile with an optional start date", async () => {
    const response = await request(app).post("/api/v1/batches").set(headers()).send(batch()).expect(201);
    expect(response.body.data).toMatchObject({ name: batch().name, startDate: "2026-10-01", monthlyFeeMinor: "125000", monthlyFee: "1250", classLevel: { name: "Class 10" }, medium: { name: "Bangla" }, academicGroup: { name: "Science" } });
    const updated = await request(app).patch(`/api/v1/batches/${response.body.data.id}`).set(headers()).send({ startDate: "2026-10-15", mediumId: null }).expect(200);
    expect(updated.body.data).toMatchObject({ startDate: "2026-10-15", medium: null });
    await request(app).patch(`/api/v1/batches/${response.body.data.id}`).set(headers()).send({ startDate: "not-a-date" }).expect(400);
  });
  it("supports monthly fee in Taka (major units) and converts to minor units correctly", async () => {
    const response = await request(app).post("/api/v1/batches").set(headers()).send({
      name: `Taka Fee Batch ${suffix}`,
      classLevelId: classLevelA,
      monthlyFee: 2000,
    }).expect(201);
    expect(response.body.data).toMatchObject({
      name: `Taka Fee Batch ${suffix}`,
      monthlyFeeMinor: "200000",
      monthlyFee: "2000",
    });
    const updated = await request(app).patch(`/api/v1/batches/${response.body.data.id}`).set(headers()).send({
      monthlyFee: "2500.50",
    }).expect(200);
    expect(updated.body.data).toMatchObject({
      monthlyFeeMinor: "250050",
      monthlyFee: "2500.50",
    });
  });
  it("supports optional academic references and blocks duplicate or cross-workspace data", async () => {
    await request(app).post("/api/v1/batches").set(headers()).send(batch({ name: `Optional ${suffix}`, mediumId: null, academicGroupId: null, startDate: null })).expect(201).expect(({ body }) => expect(body.data.startDate).toBeNull());
    await request(app).post("/api/v1/batches").set(headers()).send(batch({ name: `Duplicate ${suffix}` })).expect(201);
    await request(app).post("/api/v1/batches").set(headers()).send(batch({ name: `Duplicate ${suffix}` })).expect(409);
    await request(app).post("/api/v1/batches").set(headers()).send(batch({ name: `Bad Class ${suffix}`, classLevelId: classLevelB })).expect(400);
  });
  it("assigns, changes primary status, removes, and isolates batch teachers", async () => {
    const created = await request(app).post("/api/v1/batches").set(headers()).send(batch({ name: `Teacher Batch ${suffix}` })).expect(201);
    const assignment = await request(app).post(`/api/v1/batches/${created.body.data.id}/teachers`).set(headers()).send({ teacherId: teacherA, isPrimary: true }).expect(201);
    expect(assignment.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ teacherId: teacherA, name: "Amina Rahman", isPrimary: true })]));
    await request(app).post(`/api/v1/batches/${created.body.data.id}/teachers`).set(headers()).send({ teacherId: teacherA }).expect(409);
    const reassigned = await request(app).post(`/api/v1/batches/${created.body.data.id}/teachers`).set(headers()).send({ teacherId: teacherA2, isPrimary: true }).expect(201);
    expect(reassigned.body.data.filter((teacher) => teacher.isPrimary)).toEqual([expect.objectContaining({ teacherId: teacherA2 })]);
    await request(app).post(`/api/v1/batches/${created.body.data.id}/teachers`).set(headers()).send({ teacherId: teacherB }).expect(400);
    await request(app).patch(`/api/v1/batches/${created.body.data.id}/teachers/${teacherA2}`).set(headers()).send({ isPrimary: false }).expect(200);
    await request(app).delete(`/api/v1/batches/${created.body.data.id}/teachers/${teacherA}`).set(headers()).expect(200).expect(({ body }) => expect(body.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ teacherId: teacherA })])));
    await request(app).get(`/api/v1/batches/${workspaceBBatchId}/teachers`).set(headers()).expect(404);
    const client = await pool.connect();
    try { await client.query("SET ROLE eduflow_app"); await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceA]); expect((await client.query("SELECT workspace_id FROM batch_teachers WHERE workspace_id = $1", [workspaceB])).rows).toEqual([]); } finally { await client.query("RESET ROLE"); client.release(); }
  });
  it("enrolls, updates, archives, reactivates, and preserves batch student history", async () => {
    const created = await request(app).post("/api/v1/batches").set(headers()).send(batch({ name: `Student Batch ${suffix}` })).expect(201);
    const batchId = created.body.data.id;

    // Enroll student
    const enrollRes = await request(app)
      .post(`/api/v1/batches/${batchId}/students`)
      .set(headers())
      .send({
        studentId: studentA,
        feeOverrideMinor: "100000",
        discountMinor: "10000",
        joinedAt: "2026-10-05",
      })
      .expect(201);
    expect(enrollRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: studentA,
          name: "Rahim Uddin",
          feeOverrideMinor: "100000",
          discountMinor: "10000",
          joinedAt: "2026-10-05",
          status: "active",
        }),
      ]),
    );
    const enrollmentId = enrollRes.body.data.find((e) => e.studentId === studentA).id;

    // Cannot enroll duplicate active student
    await request(app)
      .post(`/api/v1/batches/${batchId}/students`)
      .set(headers())
      .send({ studentId: studentA })
      .expect(409);

    // Cannot enroll cross-workspace student
    await request(app)
      .post(`/api/v1/batches/${batchId}/students`)
      .set(headers())
      .send({ studentId: studentB })
      .expect(400);

    // List enrolled students
    const listRes = await request(app)
      .get(`/api/v1/batches/${batchId}/students`)
      .set(headers())
      .expect(200);
    expect(listRes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: enrollmentId, studentId: studentA })]),
    );

    // Archive enrollment
    const archiveRes = await request(app)
      .patch(`/api/v1/batches/${batchId}/students/${enrollmentId}`)
      .set(headers())
      .send({ status: "archived" })
      .expect(200);
    expect(archiveRes.body.data.find((e) => e.id === enrollmentId).status).toBe("archived");

    // Reactivate enrollment
    const reactivateRes = await request(app)
      .patch(`/api/v1/batches/${batchId}/students/${enrollmentId}`)
      .set(headers())
      .send({ status: "active" })
      .expect(200);
    expect(reactivateRes.body.data.find((e) => e.id === enrollmentId).status).toBe("active");

    // Removing an enrollment archives it; history is never destructively deleted.
    const archiveByDeleteRes = await request(app)
      .delete(`/api/v1/batches/${batchId}/students/${enrollmentId}`)
      .set(headers())
      .expect(200);
    expect(archiveByDeleteRes.body.data.find((e) => e.id === enrollmentId).status).toBe("archived");

    const studentEnrollments = await request(app)
      .get(`/api/v1/students/${studentA}/enrollments`)
      .set(headers())
      .expect(200);
    expect(studentEnrollments.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: enrollmentId, batchId, batchName: `Student Batch ${suffix}`, status: "archived" }),
    ]));
  });
  it("blocks unauthenticated, permissionless, cross-workspace, and RLS access", async () => {
    await request(app).get("/api/v1/batches").set("X-Workspace-Id", workspaceA).expect(401);
    await request(app).get("/api/v1/batches").set({ Cookie: restrictedCookie, "X-Workspace-Id": workspaceA }).expect(403);
    await request(app).get("/api/v1/batches").set(headers(workspaceB)).expect(403);
    await request(app).get(`/api/v1/batches/${workspaceBBatchId}`).set(headers()).expect(404);
    const client = await pool.connect();
    try { await client.query("SET ROLE eduflow_app"); await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceA]); const visible = await client.query("SELECT workspace_id FROM batches ORDER BY workspace_id"); expect(visible.rows).not.toEqual(expect.arrayContaining([{ workspace_id: workspaceB }])); expect((await client.query("UPDATE batches SET name = 'blocked' WHERE id = $1", [workspaceBBatchId])).rowCount).toBe(0); } finally { await client.query("RESET ROLE"); client.release(); }
  });
});
