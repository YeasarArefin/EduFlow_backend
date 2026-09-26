import request from 'supertest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/backend/src/app.js');
const { env } = require('../dist/backend/src/config/env.js');
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const planId = randomUUID();
const featureKey = `dashboard-feature-${suffix}`;
const email = `dashboard-${suffix}@example.test`;
const dashboardMonth = '2100-03-01';
let dashboardBatchId;

describe('workspace dashboard summary API', () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    const signUp = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Dashboard User', email, password: 'safe-test-password' })
      .expect(200);
    userId = signUp.body.user.id;
    await pool.query('UPDATE "user" SET email_verified = true WHERE id = $1', [userId]);
    await pool.query('DELETE FROM session WHERE user_id = $1', [userId]);
    const signIn = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: 'safe-test-password' })
      .expect(200);
    cookie = signIn.headers['set-cookie']?.[0];
    await pool.query(
      'INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, $2, $3, 30, 0)',
      [planId, 'Dashboard Plan', `dashboard-plan-${suffix}`]
    );
    await pool.query('INSERT INTO features (key, name) VALUES ($1, $2)', [
      featureKey,
      'Dashboard feature',
    ]);
    await pool.query(
      'INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES ($1, $2, true, 25)',
      [planId, featureKey]
    );
    await pool.query(
      "INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active'), ($4, $5, $6, 'active')",
      [
        workspaceId,
        'Dashboard Workspace',
        `dashboard-${suffix}`,
        otherWorkspaceId,
        'Other Workspace',
        `other-dashboard-${suffix}`,
      ]
    );
    await pool.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101), ($1, $3, 201)',
      [workspaceId, userId, `other-user-${suffix}`]
    );
    await pool.query(
      "INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at, renewal_due_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days', now() + interval '30 days')",
      [workspaceId, planId]
    );
    await pool.query(
      "INSERT INTO payment_requests (workspace_id, requested_by_user_id, purpose, plan_id, amount_minor, payment_method, sender_bkash_number, transaction_id, status, reviewed_at) VALUES ($1, $2, 'subscription', $3, 100, 'bkash', '01700000000', $4, 'approved', now())",
      [workspaceId, userId, planId, `DASH-${suffix}`]
    );

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const classLevelId = (
      await pool.query(
        "INSERT INTO class_levels (workspace_id, name) VALUES ($1, 'Dashboard Class') RETURNING id",
        [workspaceId]
      )
    ).rows[0].id;
    dashboardBatchId = (
      await pool.query(
        'INSERT INTO batches (workspace_id, name, class_level_id, class_days) VALUES ($1, $2, $3, $4) RETURNING id',
        [workspaceId, 'Dashboard Batch', classLevelId, [weekday]]
      )
    ).rows[0].id;
    const otherBatchId = (
      await pool.query(
        'INSERT INTO batches (workspace_id, name, class_level_id, class_days) VALUES ($1, $2, $3, $4) RETURNING id',
        [workspaceId, 'Other Dashboard Batch', classLevelId, []]
      )
    ).rows[0].id;
    const [student, otherStudent] = (
      await pool.query(
        "INSERT INTO students (workspace_id, student_code, full_name) VALUES ($1, 'DASH-001', 'Dashboard Student'), ($1, 'DASH-002', 'Other Dashboard Student') RETURNING id",
        [workspaceId]
      )
    ).rows;
    const [enrollment, otherEnrollment] = (
      await pool.query(
        "INSERT INTO batch_enrollments (workspace_id, batch_id, student_id, status, enrolled_at) VALUES ($1, $2, $3, 'active', '2099-01-01'), ($1, $4, $5, 'active', '2099-01-01') RETURNING id",
        [workspaceId, dashboardBatchId, student.id, otherBatchId, otherStudent.id]
      )
    ).rows;
    const [fee, otherFee] = (
      await pool.query(
        "INSERT INTO student_fees (workspace_id, student_id, enrollment_id, fee_month, expected_amount, discount_amount, paid_amount, status, due_date, grace_date) VALUES ($1, $2, $3, $4, 100, 0, 40, 'partially_paid', $4, $4), ($1, $5, $6, $4, 70, 0, 0, 'unpaid', $4, $4) RETURNING id",
        [
          workspaceId,
          student.id,
          enrollment.id,
          dashboardMonth,
          otherStudent.id,
          otherEnrollment.id,
        ]
      )
    ).rows;
    await pool.query(
      "INSERT INTO student_payments (workspace_id, student_id, student_fee_id, amount, payment_method, payment_date, receipt_number) VALUES ($1, $2, $3, 40, 'cash', '2100-03-10', $4), ($1, $5, $6, 50, 'cash', '2100-03-11', $7)",
      [
        workspaceId,
        student.id,
        fee.id,
        `DASH-REC-1-${suffix}`,
        otherStudent.id,
        otherFee.id,
        `DASH-REC-2-${suffix}`,
      ]
    );
    const teacherId = (
      await pool.query(
        "INSERT INTO teachers (workspace_id, teacher_code, name) VALUES ($1, 'DASH-T-001', 'Dashboard Teacher') RETURNING id",
        [workspaceId]
      )
    ).rows[0].id;
    const salaryId = (
      await pool.query(
        "INSERT INTO teacher_salaries (workspace_id, teacher_id, salary_month, expected_salary, adjustment_amount, paid_amount, status, payment_start_date) VALUES ($1, $2, $3, 100, 0, 30, 'partially_paid', $3) RETURNING id",
        [workspaceId, teacherId, dashboardMonth]
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO teacher_salary_payments (workspace_id, teacher_salary_id, amount, payment_method, payment_date) VALUES ($1, $2, 30, 'cash', '2100-03-12')",
      [workspaceId, salaryId]
    );
    const categoryId = (
      await pool.query(
        "INSERT INTO expense_categories (workspace_id, name) VALUES ($1, 'Dashboard Expenses') RETURNING id",
        [workspaceId]
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO expenses (workspace_id, category_id, title, amount, expense_date, payment_method, recorded_by_user_id) VALUES ($1, $2, 'Dashboard expense', 10, '2100-03-13', 'cash', $3)",
      [workspaceId, categoryId, userId]
    );
    const sessionId = (
      await pool.query(
        "INSERT INTO attendance_sessions (workspace_id, batch_id, session_date, status) VALUES ($1, $2, $3, 'finalized') RETURNING id",
        [workspaceId, dashboardBatchId, today]
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO attendance_records (workspace_id, attendance_session_id, student_id, status) VALUES ($1, $2, $3, 'present'), ($1, $2, $4, 'absent')",
      [workspaceId, sessionId, student.id, otherStudent.id]
    );
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      for (const table of [
        'attendance_records',
        'attendance_sessions',
        'expenses',
        'expense_categories',
        'teacher_salary_payments',
        'teacher_salaries',
        'student_payments',
        'student_fees',
        'batch_enrollments',
        'batches',
        'teachers',
        'students',
        'class_levels',
      ]) {
        await client.query(`DELETE FROM ${table} WHERE workspace_id IN ($1, $2)`, [
          workspaceId,
          otherWorkspaceId,
        ]);
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query('DELETE FROM payment_requests WHERE workspace_id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query('DELETE FROM subscriptions WHERE workspace_id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query('DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query('DELETE FROM plan_features WHERE plan_id = $1', [planId]);
    await pool.query('DELETE FROM features WHERE key = $1', [featureKey]);
    await pool.query('DELETE FROM plans WHERE id = $1', [planId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  it("returns only the caller's workspace data and current access", async () => {
    const response = await request(app)
      .get('/api/v1/workspaces/dashboard-summary')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(response.body.data).toMatchObject({
      workspace: { id: workspaceId, name: 'Dashboard Workspace' },
      access: { allowed: true, status: 'active' },
      memberCount: 2,
      subscription: { planName: 'Dashboard Plan' },
    });
    expect(response.body.data.entitlements).toContainEqual({
      key: featureKey,
      enabled: true,
      limit: '25',
    });
    expect(response.body.data.latestPayment).toMatchObject({ status: 'approved' });
    expect(JSON.stringify(response.body.data)).not.toContain('Other Workspace');
  });

  it('returns tenant-safe operational metrics with validated month and batch filters', async () => {
    const response = await request(app)
      .get('/api/v1/workspaces/dashboard-summary')
      .query({ month: dashboardMonth, batchId: dashboardBatchId })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(response.body.data.operational).toMatchObject({
      activeStudents: 2,
      activeBatches: 2,
      activeTeachers: 1,
      today: {
        scheduledBatchCount: 1,
        attendance: {
          sessionCount: 1,
          finalizedSessionCount: 1,
          draftSessionCount: 0,
          presentCount: 1,
          absentCount: 1,
        },
      },
      monthlyFinance: {
        month: dashboardMonth,
        collectedFees: '40.00',
        outstandingFees: '60.00',
        paidSalaries: '30.00',
        expenses: '10.00',
        netCashFlow: '0.00',
      },
    });

    await request(app)
      .get('/api/v1/workspaces/dashboard-summary')
      .query({ month: '2100-03-10' })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(400);
  });

  it('denies unauthenticated and cross-workspace reads', async () => {
    await request(app)
      .get('/api/v1/workspaces/dashboard-summary')
      .set('X-Workspace-Id', workspaceId)
      .expect(401);
    await request(app)
      .get('/api/v1/workspaces/dashboard-summary')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', otherWorkspaceId)
      .expect(403);
  });
});
