import request from "supertest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");
const { env } = require("../dist/backend/src/config/env.js");
const { studentFeePermissions } = require("../dist/backend/src/config/student-fees.js");
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const workspaceA = randomUUID(), workspaceB = randomUUID(), planId = randomUUID();
const suffix = randomUUID();
let ownerId, cookie, restrictedId, restrictedCookie, memberId, studentA, studentB, classA, classB;
const headers = (workspaceId = workspaceA, session = cookie) => ({ Cookie: session, "X-Workspace-Id": workspaceId });
const singleUrl = (id) => `/api/v1/student-fees/enrollments/${id}/generate`;
const generate = (id, feeMonth = "2100-01-01") => request(app).post(singleUrl(id)).set(headers()).send({ feeMonth });
async function enrollment({ workspaceId = workspaceA, amount = "125050", override = null, discount = null, status = "active", enrolledAt = "2020-01-01", feeStartMonth = null, endedAt = null, batchStatus = "active", studentId } = {}) {
  const batch = (await pool.query("INSERT INTO batches (workspace_id, name, class_level_id, monthly_fee_minor, status) VALUES ($1, $2, $3, $4, $5) RETURNING id", [workspaceId, randomUUID(), workspaceId === workspaceA ? classA : classB, amount, batchStatus])).rows[0];
  const row = (await pool.query("INSERT INTO batch_enrollments (workspace_id, batch_id, student_id, fee_override_minor, discount_minor, status, enrolled_at, fee_start_month, ended_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [workspaceId, batch.id, studentId ?? (workspaceId === workspaceA ? studentA : studentB), override, discount, status, enrolledAt, feeStartMonth, endedAt])).rows[0];
  return { id: row.id, batchId: batch.id };
}

describe("student monthly fee foundation", () => {
  beforeAll(async () => {
    for (const restricted of [false, true]) {
      const email = `fee-${restricted}-${suffix}@example.test`;
      const signup = await request(app).post("/api/auth/sign-up/email").send({ name: "Fee Test User", email, password: "safe-test-password" }).expect(200);
      const signin = await request(app).post("/api/auth/sign-in/email").send({ email, password: "safe-test-password" }).expect(200);
      if (restricted) { restrictedId = signup.body.user.id; restrictedCookie = signin.headers["set-cookie"][0]; }
      else { ownerId = signup.body.user.id; cookie = signin.headers["set-cookie"][0]; }
    }
    await pool.query("INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, 'Fee Test Plan', $2, 30, 0)", [planId, suffix]);
    for (const workspaceId of [workspaceA, workspaceB]) {
      await pool.query("INSERT INTO workspaces (id, name, slug, status) VALUES ($1::uuid, 'Fee Test Workspace', $1::text, 'active')", [workspaceId]);
      await pool.query("INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days')", [workspaceId, planId]);
      await pool.query("INSERT INTO workspace_settings (workspace_id, default_fee_due_day, grace_period_days) VALUES ($1, 10, 7)", [workspaceId]);
      const student = (await pool.query("INSERT INTO students (workspace_id, student_code, full_name) VALUES ($1, 'FEE-001', 'Fee Test Student') RETURNING id", [workspaceId])).rows[0].id;
      const academic = (await pool.query("INSERT INTO class_levels (workspace_id, name) VALUES ($1, 'Fee Test Class') RETURNING id", [workspaceId])).rows[0].id;
      if (workspaceId === workspaceA) { studentA = student; classA = academic; }
      else { studentB = student; classB = academic; }
    }
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101)", [workspaceA, ownerId]);
    memberId = (await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 201) RETURNING id", [workspaceA, restrictedId])).rows[0].id;
  });

  afterAll(async () => {
    for (const table of ["student_fees", "audit_logs", "batch_enrollments", "batches", "students", "class_levels", "member_permission_overrides", "workspace_members", "workspace_settings", "subscriptions"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id IN ($1, $2)`, [workspaceA, workspaceB]);
    }
    await pool.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [ownerId, restrictedId]);
    await pool.end();
  });

  it("generates exact decimal taka, snapshots due/grace dates, and audits once", async () => {
    const e = await enrollment({ override: "100025", discount: "10010" });
    const response = await generate(e.id).expect(201);
    expect(response.body.data).toMatchObject({ studentId: studentA, enrollmentId: e.id, feeMonth: "2100-01-01", expectedAmount: "1000.25", discountAmount: "100.10", paidAmount: "0.00", dueAmount: "900.15", status: "unpaid", dueDate: "2100-01-10", graceDate: "2100-01-17" });
    expect(response.body.data).not.toHaveProperty("workspaceId");
    expect(response.body.data).toHaveProperty("createdAt");
    const retry = await generate(e.id).expect(200);
    expect(retry.body.data).toEqual(response.body.data);
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE workspace_id = $1 AND entity_id = $2 AND action = 'fees.generated'", [workspaceA, e.id])).rows[0].n).toBe(1);
  });

  it("falls back to batch fees, honors zero overrides, and caps discounts at the charge", async () => {
    const normal = await enrollment({ discount: "25" });
    expect((await generate(normal.id).expect(201)).body.data).toMatchObject({ expectedAmount: "1250.50", discountAmount: "0.25", dueAmount: "1250.25" });
    for (const options of [{ override: "0" }, { override: "10", discount: "100" }]) {
      const e = await enrollment(options);
      expect((await generate(e.id).expect(201)).body.data).toMatchObject({ dueAmount: "0.00", status: "waived" });
    }
  });

  it("retains precision above Number.MAX_SAFE_INTEGER and at the bigint source limit", async () => {
    const e = await enrollment({ amount: "9223372036854775807", discount: "1" });
    expect((await generate(e.id).expect(201)).body.data).toMatchObject({ expectedAmount: "92233720368547758.07", discountAmount: "0.01", dueAmount: "92233720368547758.06" });
  });

  it("keeps historical amounts and dates when the batch, enrollment, and settings change", async () => {
    const e = await enrollment();
    const first = (await generate(e.id).expect(201)).body.data;
    await pool.query("UPDATE batches SET monthly_fee_minor = 300000 WHERE id = $1", [e.batchId]);
    await pool.query("UPDATE batch_enrollments SET discount_minor = 10000 WHERE id = $1", [e.id]);
    await pool.query("UPDATE workspace_settings SET default_fee_due_day = 31 WHERE workspace_id = $1", [workspaceA]);
    try {
      expect((await generate(e.id).expect(200)).body.data).toEqual(first);
      expect((await generate(e.id, "2100-02-01").expect(201)).body.data).toMatchObject({ expectedAmount: "3000.00", discountAmount: "100.00", dueAmount: "2900.00", dueDate: "2100-02-28", graceDate: "2100-03-07" });
      await pool.query("UPDATE batch_enrollments SET status = 'archived' WHERE id = $1", [e.id]);
      expect((await generate(e.id).expect(200)).body.data).toEqual(first);
      await generate(e.id, "2100-03-01").expect(409);
    } finally { await pool.query("UPDATE workspace_settings SET default_fee_due_day = 10 WHERE workspace_id = $1", [workspaceA]); }
  });

  it("deduplicates simultaneous single and bulk generation without duplicate audit effects", async () => {
    const e = await enrollment();
    const responses = await Promise.all([generate(e.id, "2100-04-01"), generate(e.id, "2100-04-01")]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.data.id).toBe(responses[1].body.data.id);
    const bulk = await Promise.all([1, 2].map(() => request(app).post("/api/v1/student-fees/generate").set(headers()).send({ feeMonth: "2100-05-01" }).expect(200)));
    const eligible = bulk[0].body.data.eligible;
    expect(bulk[0].body.data.created + bulk[1].body.data.created).toBe(eligible);
    expect((await pool.query("SELECT count(*)::int AS n FROM student_fees WHERE workspace_id = $1 AND fee_month = '2100-05-01'", [workspaceA])).rows[0].n).toBe(eligible);
  });

  it("bulk-generates only eligible active memberships and safely repeats", async () => {
    const active = await enrollment({ enrolledAt: "2099-06-20" });
    const skipped = [];
    for (const options of [
      { status: "inactive" }, { status: "completed" }, { status: "cancelled" }, { status: "archived" },
      { enrolledAt: "2099-07-01" }, { feeStartMonth: "2099-07-01" }, { endedAt: "2099-05-31" },
      { batchStatus: "inactive" }, { batchStatus: "archived" }, { workspaceId: workspaceB },
    ]) skipped.push((await enrollment(options)).id);
    const inactiveStudent = (await pool.query("INSERT INTO students (workspace_id, student_code, full_name, status) VALUES ($1, 'FEE-INACTIVE', 'Inactive Student', 'inactive') RETURNING id", [workspaceA])).rows[0].id;
    skipped.push((await enrollment({ studentId: inactiveStudent })).id);
    const first = (await request(app).post("/api/v1/student-fees/generate").set(headers()).send({ feeMonth: "2099-06-01" }).expect(200)).body.data;
    expect(first.created).toBeGreaterThan(0);
    expect(first.existing).toBe(0);
    const rows = (await pool.query("SELECT enrollment_id FROM student_fees WHERE workspace_id = $1 AND fee_month = '2099-06-01'", [workspaceA])).rows.map((r) => r.enrollment_id);
    expect(rows).toContain(active.id);
    for (const id of skipped) expect(rows).not.toContain(id);
    const second = (await request(app).post("/api/v1/student-fees/generate").set(headers()).send({ feeMonth: "2099-06-01" }).expect(200)).body.data;
    expect(second).toEqual({ feeMonth: "2099-06-01", eligible: first.eligible, created: 0, existing: first.eligible });
  });

  it("supports an empty eligible set and rejects ineligible single generation", async () => {
    expect((await request(app).post("/api/v1/student-fees/generate").set(headers()).send({ feeMonth: "1900-01-01" }).expect(200)).body.data).toMatchObject({ eligible: 0, created: 0, existing: 0 });
    const e = await enrollment({ feeStartMonth: "2101-01-01" });
    await generate(e.id).expect(409).expect(({ body }) => expect(body.error.code).toBe("ENROLLMENT_NOT_FEE_ELIGIBLE"));
    await generate(randomUUID()).expect(404);
  });

  it("defaults missing settings to month-end and rejects invalid settings without a partial fee", async () => {
    const e = await enrollment();
    await pool.query("DELETE FROM workspace_settings WHERE workspace_id = $1", [workspaceA]);
    try {
      expect((await generate(e.id, "2104-02-01").expect(201)).body.data).toMatchObject({ dueDate: "2104-02-29", graceDate: "2104-02-29" });
    } finally { await pool.query("INSERT INTO workspace_settings (workspace_id, default_fee_due_day, grace_period_days) VALUES ($1, 10, 7)", [workspaceA]); }
    await pool.query("UPDATE workspace_settings SET grace_period_days = -1 WHERE workspace_id = $1", [workspaceA]);
    try { await generate(e.id, "2104-03-01").expect(409); }
    finally { await pool.query("UPDATE workspace_settings SET grace_period_days = 7 WHERE workspace_id = $1", [workspaceA]); }
    expect((await pool.query("SELECT id FROM student_fees WHERE enrollment_id = $1 AND fee_month = '2104-03-01'", [e.id])).rows).toEqual([]);
  });

  it("calculates every status and due amount exactly, including date-sensitive overdue filtering", async () => {
    const cases = [
      { paid: "0.00", stored: "unpaid", due: "100.00" },
      { paid: "0.10", stored: "partially_paid", due: "99.90" },
      { paid: "100.00", stored: "paid", due: "0.00" },
      { paid: "100.01", stored: "overpaid", due: "0.00" },
    ];
    for (const c of cases) {
      const e = await enrollment({ amount: "10000" });
      const fee = (await generate(e.id, "2105-01-01").expect(201)).body.data;
      // Fixture-only writes exercise the foundation; there is no payment API.
      await pool.query("UPDATE student_fees SET paid_amount = $2, status = $3 WHERE id = $1", [fee.id, c.paid, c.stored]);
      expect((await generate(e.id, "2105-01-01").expect(200)).body.data).toMatchObject({ status: c.stored, dueAmount: c.due, paidAmount: c.paid });
    }
    const overdue = await enrollment();
    expect((await generate(overdue.id, "2020-01-01").expect(201)).body.data.status).toBe("overdue");
    await pool.query("UPDATE student_fees SET status = 'unpaid', grace_date = (current_timestamp at time zone 'Asia/Dhaka')::date WHERE enrollment_id = $1", [overdue.id]);
    expect((await generate(overdue.id, "2020-01-01").expect(200)).body.data.status).toBe("unpaid");
    await pool.query("UPDATE student_fees SET grace_date = (current_timestamp at time zone 'Asia/Dhaka')::date - 1 WHERE enrollment_id = $1", [overdue.id]);
    const list = await request(app).get("/api/v1/student-fees").set(headers()).query({ feeMonth: "2020-01-01", status: "overdue" }).expect(200);
    expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ enrollmentId: overdue.id, status: "overdue" })]));
    expect(list.body.meta.total).toBe(list.body.data.length);
  });

  it("paginates history and workspace lists consistently and preserves archived history", async () => {
    const history = await request(app).get(`/api/v1/students/${studentA}/fees`).set(headers()).query({ limit: 1 }).expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.meta.total).toBeGreaterThan(1);
    const next = await request(app).get(`/api/v1/students/${studentA}/fees`).set(headers()).query({ limit: 1, page: 2 }).expect(200);
    expect(next.body.data[0].id).not.toBe(history.body.data[0].id);
    expect(next.body.meta.total).toBe(history.body.meta.total);
    const e = await enrollment();
    const fee = (await generate(e.id, "2106-01-01").expect(201)).body.data;
    await pool.query("UPDATE batch_enrollments SET status = 'archived' WHERE id = $1", [e.id]);
    const filtered = await request(app).get(`/api/v1/students/${studentA}/fees`).set(headers()).query({ feeMonth: "2106-01-01", status: "unpaid" }).expect(200);
    expect(filtered.body.data).toEqual([fee]);
  });

  it("rejects invalid inputs and client-owned workspace, amounts, dates, or statuses", async () => {
    const e = await enrollment();
    for (const feeMonth of ["2100-01", "2100-02-30", "2100-01-02", "0000-01-01", "9999-01-01", "bad", 100]) {
      await generate(e.id, feeMonth).expect(400);
    }
    for (const extra of [{ workspaceId: workspaceB }, { paidAmount: "1.00" }, { status: "paid" }, { dueDate: "2100-01-01" }]) {
      await request(app).post(singleUrl(e.id)).set(headers()).send({ feeMonth: "2100-01-01", ...extra }).expect(400);
    }
    await generate("bad-id").expect(400);
    await request(app).get("/api/v1/student-fees").set(headers()).expect(400);
    for (const extra of [{ status: "invalid" }, { page: 0 }, { limit: 101 }, { workspaceId: workspaceB }]) {
      await request(app).get("/api/v1/student-fees").set(headers()).query({ feeMonth: "2100-01-01", ...extra }).expect(400);
    }
    await request(app).get("/api/v1/students/bad-id/fees").set(headers()).expect(400);
  });

  it("enforces authentication, separate fee grants, subscription access, and workspace scope on every API", async () => {
    const e = await enrollment();
    const routes = [
      ["post", singleUrl(e.id), { feeMonth: "2107-01-01" }],
      ["post", "/api/v1/student-fees/generate", { feeMonth: "2107-01-01" }],
      ["get", "/api/v1/student-fees?feeMonth=2107-01-01"],
      ["get", `/api/v1/students/${studentA}/fees`],
    ];
    for (const [method, url, body] of routes) {
      await request(app)[method](url).send(body).expect(401);
      await request(app)[method](url).set(headers(workspaceA, restrictedCookie)).send(body).expect(403);
      await request(app)[method](url).set(headers(workspaceB)).send(body).expect(403);
    }
    await pool.query("UPDATE subscriptions SET expires_at = now() - interval '1 day' WHERE workspace_id = $1", [workspaceA]);
    try {
      for (const [method, url, body] of routes) await request(app)[method](url).set(headers()).send(body).expect(403);
    } finally { await pool.query("UPDATE subscriptions SET expires_at = now() + interval '30 days' WHERE workspace_id = $1", [workspaceA]); }
    await pool.query("INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, $3, true)", [workspaceA, memberId, studentFeePermissions.view.code]);
    await request(app).get(`/api/v1/students/${studentA}/fees`).set(headers(workspaceA, restrictedCookie)).expect(200);
    await request(app).post(singleUrl(e.id)).set(headers(workspaceA, restrictedCookie)).send({ feeMonth: "2107-01-01" }).expect(403);
    await pool.query("INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, $3, true)", [workspaceA, memberId, studentFeePermissions.generate.code]);
    await request(app).post(singleUrl(e.id)).set(headers(workspaceA, restrictedCookie)).send({ feeMonth: "2107-01-01" }).expect(201);
    const foreign = await enrollment({ workspaceId: workspaceB });
    await generate(foreign.id).expect(404);
    await request(app).get(`/api/v1/students/${studentB}/fees`).set(headers()).expect(404);
  });

  it("enforces numeric storage, month uniqueness, amount/status checks and tenant-safe foreign keys", async () => {
    const columns = await pool.query("SELECT column_name, data_type, numeric_scale FROM information_schema.columns WHERE table_name = 'student_fees' AND column_name LIKE '%_amount'");
    expect(columns.rows).toHaveLength(4);
    for (const column of columns.rows) expect(column).toMatchObject({ data_type: "numeric", numeric_scale: 2 });
    const e = await enrollment();
    const fee = (await generate(e.id, "2108-01-01").expect(201)).body.data;
    const duplicate = "INSERT INTO student_fees (workspace_id, student_id, enrollment_id, fee_month, expected_amount, due_date, grace_date) VALUES ($1,$2,$3,'2108-01-01',10,'2108-01-10','2108-01-17')";
    await expect(pool.query(duplicate, [workspaceA, studentA, e.id])).rejects.toMatchObject({ code: "23505" });
    for (const change of ["expected_amount = -1", "expected_amount = 'NaN'", "discount_amount = expected_amount + 1", "paid_amount = -1", "status = 'paid'", "fee_month = '2108-01-02'", "grace_date = '2108-01-01'"]) {
      await expect(pool.query(`UPDATE student_fees SET ${change} WHERE id = $1`, [fee.id])).rejects.toMatchObject({ code: "23514" });
    }
    await expect(pool.query("UPDATE student_fees SET workspace_id = $2 WHERE id = $1", [fee.id, workspaceB])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("UPDATE student_fees SET student_id = $2 WHERE id = $1", [fee.id, studentB])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("DELETE FROM batch_enrollments WHERE id = $1", [e.id])).rejects.toMatchObject({ code: "23503" });
  });

  it("uses forced RLS to block cross-tenant reads, writes, deletes and missing-context access", async () => {
    const e = await enrollment({ workspaceId: workspaceB });
    const foreignFee = (await pool.query("INSERT INTO student_fees (workspace_id, student_id, enrollment_id, fee_month, expected_amount, due_date, grace_date) VALUES ($1,$2,$3,'2100-01-01',10,'2100-01-10','2100-01-17') RETURNING id", [workspaceB, studentB, e.id])).rows[0].id;
    const own = await enrollment();
    const client = await pool.connect();
    try {
      const flags = await client.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'student_fees'::regclass");
      expect(flags.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      await client.query("SET ROLE eduflow_app");
      await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceA]);
      expect((await client.query("SELECT id FROM student_fees WHERE workspace_id = $1", [workspaceB])).rows).toEqual([]);
      expect((await client.query("UPDATE student_fees SET updated_at = now() WHERE id = $1", [foreignFee])).rowCount).toBe(0);
      expect((await client.query("DELETE FROM student_fees WHERE id = $1", [foreignFee])).rowCount).toBe(0);
      const insert = "INSERT INTO student_fees (workspace_id, student_id, enrollment_id, fee_month, expected_amount, due_date, grace_date) VALUES ($1,$2,$3,'2109-01-01',10,'2109-01-10','2109-01-17')";
      await expect(client.query(insert, [workspaceB, studentB, e.id])).rejects.toMatchObject({ code: "42501" });
      await expect(client.query(insert, [workspaceA, studentB, e.id])).rejects.toMatchObject({ code: "23503" });
      await client.query(insert, [workspaceA, studentA, own.id]);
      expect((await client.query("SELECT id FROM student_fees WHERE enrollment_id = $1", [own.id])).rows).toHaveLength(1);
      await client.query("SELECT set_config('app.workspace_id', '', false)");
      expect((await client.query("SELECT id FROM student_fees")).rows).toEqual([]);
      await expect(client.query(insert, [workspaceA, studentA, own.id])).rejects.toMatchObject({ code: "42501" });
    } finally { await client.query("RESET ROLE"); await client.query("RESET app.workspace_id"); client.release(); }
  });
});
