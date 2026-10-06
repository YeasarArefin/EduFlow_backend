import request from 'supertest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');
const { env } = require('../dist/src/config/env.js');
const { studentFeePermissions } = require('../dist/src/config/student-fees.js');

const app = createApp();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const workspaceA = randomUUID();
const workspaceB = randomUUID();
const planId = randomUUID();
const suffix = randomUUID();
const salaryMonth = '2026-09-01';

let ownerId;
let ownerCookie;
let restrictedId;
let restrictedCookie;
let restrictedMemberId;
let teacherA;
let salaryA;
let salaryB;

const headers = (session = ownerCookie) => ({
  Cookie: session,
  'X-Workspace-Id': workspaceA,
});

describe('teacher salary API', () => {
  beforeAll(async () => {
    for (const restricted of [false, true]) {
      const email = `salary-${restricted}-${suffix}@example.test`;
      const signup = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ name: 'Salary Test User', email, password: 'safe-test-password' })
        .expect(200);
      const signin = await request(app)
        .post('/api/auth/sign-in/email')
        .send({ email, password: 'safe-test-password' })
        .expect(200);
      if (restricted) {
        restrictedId = signup.body.user.id;
        restrictedCookie = signin.headers['set-cookie'][0];
      } else {
        ownerId = signup.body.user.id;
        ownerCookie = signin.headers['set-cookie'][0];
      }
    }

    await pool.query(
      "INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, 'Salary API Plan', $2, 30, 0)",
      [planId, `salary-api-${suffix}`]
    );
    for (const [id, name] of [
      [workspaceA, 'Salary Workspace A'],
      [workspaceB, 'Salary Workspace B'],
    ]) {
      await pool.query(
        "INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active')",
        [id, name, id]
      );
      await pool.query(
        "INSERT INTO subscriptions (workspace_id, plan_id, status, expires_at) VALUES ($1, $2, 'active', now() + interval '30 days')",
        [id, planId]
      );
    }
    await pool.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101)',
      [workspaceA, ownerId]
    );
    restrictedMemberId = (
      await pool.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 201) RETURNING id',
        [workspaceA, restrictedId]
      )
    ).rows[0].id;
    teacherA = (
      await pool.query(
        "INSERT INTO teachers (workspace_id, teacher_code, name, default_salary_minor) VALUES ($1, 'SAL-A', 'Salary Teacher A', 10000) RETURNING id",
        [workspaceA]
      )
    ).rows[0].id;
    const teacherB = (
      await pool.query(
        "INSERT INTO teachers (workspace_id, teacher_code, name, default_salary_minor) VALUES ($1, 'SAL-B', 'Salary Teacher B', 10000) RETURNING id",
        [workspaceB]
      )
    ).rows[0].id;
    salaryB = (
      await pool.query(
        'INSERT INTO teacher_salaries (workspace_id, teacher_id, salary_month, expected_salary, payment_start_date) VALUES ($1, $2, $3, 100.00, $3) RETURNING id',
        [workspaceB, teacherB, salaryMonth]
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    for (const table of [
      'teacher_salary_payments',
      'teacher_salaries',
      'audit_logs',
      'teachers',
      'member_permission_overrides',
      'workspace_members',
      'subscriptions',
    ]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id IN ($1, $2)`, [
        workspaceA,
        workspaceB,
      ]);
    }
    await pool.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA, workspaceB]);
    await pool.query('DELETE FROM plans WHERE id = $1', [planId]);
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [ownerId, restrictedId]);
    await pool.end();
  });

  it('generates salary ledgers idempotently and lists the workspace snapshot', async () => {
    await request(app)
      .post('/api/v1/teacher-salaries/generate')
      .set(headers())
      .send({ salaryMonth })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({ created: 1, existing: 0, eligible: 1 })
      );
    await request(app)
      .post('/api/v1/teacher-salaries/generate')
      .set(headers())
      .send({ salaryMonth })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({ created: 0, existing: 1, eligible: 1 })
      );

    const list = await request(app)
      .get(`/api/v1/teacher-salaries?salaryMonth=${salaryMonth}`)
      .set(headers())
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      teacherId: teacherA,
      expectedSalary: '100.00',
      dueAmount: '100.00',
      status: 'pending',
    });
    salaryA = list.body.data[0].id;
  });

  it('records partial payments, preserves history, and writes an audit record', async () => {
    const response = await request(app)
      .post(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers())
      .send({ amount: '25.00', paymentMethod: 'bkash', note: 'First payout' })
      .expect(201);
    expect(response.body.data.salary).toMatchObject({
      paidAmount: '25.00',
      dueAmount: '75.00',
      status: 'partially_paid',
    });

    const history = await request(app)
      .get(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers())
      .expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({
      amount: '25.00',
      paymentMethod: 'bkash',
      note: 'First payout',
    });
    expect(
      (
        await pool.query(
          "SELECT count(*)::integer AS count FROM audit_logs WHERE workspace_id = $1 AND action = 'teacher_salaries.payment_recorded'",
          [workspaceA]
        )
      ).rows[0].count
    ).toBe(1);
  });

  it('rejects zero, excess, settled, and cross-workspace payments without changing balances', async () => {
    await request(app)
      .post(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers())
      .send({ amount: '0', paymentMethod: 'cash' })
      .expect(400);
    await request(app)
      .post(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers())
      .send({ amount: '75.01', paymentMethod: 'cash' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('EXCESS_SALARY_PAYMENT_NOT_ALLOWED'));
    await request(app)
      .post(`/api/v1/teacher-salaries/${salaryB}/payments`)
      .set(headers())
      .send({ amount: '1.00', paymentMethod: 'cash' })
      .expect(404);
    await request(app)
      .get(`/api/v1/teacher-salaries/${salaryB}/payments`)
      .set(headers())
      .expect(404);

    await request(app)
      .post(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers())
      .send({ amount: '75.00', paymentMethod: 'cash' })
      .expect(201);
    await request(app)
      .post(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers())
      .send({ amount: '1.00', paymentMethod: 'cash' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('TEACHER_SALARY_ALREADY_SETTLED'));
  });

  it('enforces separate view, generation, and payment permissions', async () => {
    await request(app).get('/api/v1/teacher-salaries').set(headers(restrictedCookie)).expect(403);
    await request(app)
      .post('/api/v1/teacher-salaries/generate')
      .set(headers(restrictedCookie))
      .send({ salaryMonth })
      .expect(403);
    await request(app)
      .post(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers(restrictedCookie))
      .send({ amount: '1.00', paymentMethod: 'cash' })
      .expect(403);

    await pool.query(
      'INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1,$2,$3,true),($1,$2,$4,true),($1,$2,$5,true)',
      [
        workspaceA,
        restrictedMemberId,
        studentFeePermissions.view.code,
        studentFeePermissions.generate.code,
        studentFeePermissions.collect.code,
      ]
    );
    await request(app).get('/api/v1/teacher-salaries').set(headers(restrictedCookie)).expect(200);
    await request(app)
      .post('/api/v1/teacher-salaries/generate')
      .set(headers(restrictedCookie))
      .send({ salaryMonth })
      .expect(200);
    await request(app)
      .get(`/api/v1/teacher-salaries/${salaryA}/payments`)
      .set(headers(restrictedCookie))
      .expect(200);
  });
});
