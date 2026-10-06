import request from 'supertest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');
const { env } = require('../dist/src/config/env.js');
const { studentFeePermissions } = require('../dist/src/config/student-fees.js');

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const app = createApp();

const workspaceA = randomUUID();
const workspaceB = randomUUID();
const planId = randomUUID();
const suffix = randomUUID();

let ownerId, cookie, restrictedId, restrictedCookie, memberId;
let studentA, studentB, classA, classB;

const headers = (workspaceId = workspaceA, session = cookie) => ({
  Cookie: session,
  'X-Workspace-Id': workspaceId,
});

async function createTestEnrollmentAndFee({
  workspaceId = workspaceA,
  feeMonth = '2026-09-01',
  amount = '200000', // 2000.00 BDT
  override = null,
  discount = '20000', // 200.00 BDT
  studentId,
} = {}) {
  const batch = (
    await pool.query(
      "INSERT INTO batches (workspace_id, name, class_level_id, monthly_fee_minor, status) VALUES ($1, $2, $3, $4, 'active') RETURNING id",
      [workspaceId, randomUUID(), workspaceId === workspaceA ? classA : classB, amount]
    )
  ).rows[0];

  const enrollment = (
    await pool.query(
      "INSERT INTO batch_enrollments (workspace_id, batch_id, student_id, fee_override_minor, discount_minor, status, enrolled_at) VALUES ($1, $2, $3, $4, $5, 'active', '2020-01-01') RETURNING id",
      [
        workspaceId,
        batch.id,
        studentId ?? (workspaceId === workspaceA ? studentA : studentB),
        override,
        discount,
      ]
    )
  ).rows[0];

  const feeResponse = await request(app)
    .post(`/api/v1/student-fees/enrollments/${enrollment.id}/generate`)
    .set(headers(workspaceId))
    .send({ feeMonth })
    .expect(201);

  return { enrollmentId: enrollment.id, fee: feeResponse.body.data };
}

describe('student payments and receipts backend (Phase 9.15)', () => {
  beforeAll(async () => {
    // 1. Sign up Owner and Restricted users
    for (const restricted of [false, true]) {
      const email = `pay-${restricted}-${suffix}@example.test`;
      const signup = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ name: 'Payment Test User', email, password: 'safe-test-password' })
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
        cookie = signin.headers['set-cookie'][0];
      }
    }

    // 2. Setup subscription plan
    await pool.query(
      "INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, 'Payment Test Plan', $2, 30, 0)",
      [planId, suffix]
    );

    // 3. Setup Workspaces A and B
    for (const workspaceId of [workspaceA, workspaceB]) {
      await pool.query(
        "INSERT INTO workspaces (id, name, slug, status) VALUES ($1::uuid, 'Payment Test Workspace', $1::text, 'active')",
        [workspaceId]
      );
      await pool.query(
        "INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days')",
        [workspaceId, planId]
      );
      await pool.query(
        "INSERT INTO workspace_settings (workspace_id, default_fee_due_day, grace_period_days, receipt_prefix) VALUES ($1, 10, 7, 'TEST')",
        [workspaceId]
      );

      const student = (
        await pool.query(
          "INSERT INTO students (workspace_id, student_code, full_name) VALUES ($1, 'PAY-001', 'Payment Student') RETURNING id",
          [workspaceId]
        )
      ).rows[0].id;

      const academic = (
        await pool.query(
          "INSERT INTO class_levels (workspace_id, name) VALUES ($1, 'Payment Class') RETURNING id",
          [workspaceId]
        )
      ).rows[0].id;

      if (workspaceId === workspaceA) {
        studentA = student;
        classA = academic;
      } else {
        studentB = student;
        classB = academic;
      }
    }

    // 4. Setup workspace memberships
    await pool.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101)',
      [workspaceA, ownerId]
    );
    await pool.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 101)',
      [workspaceB, ownerId]
    );
    memberId = (
      await pool.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role_code) VALUES ($1, $2, 201) RETURNING id',
        [workspaceA, restrictedId]
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    for (const table of [
      'student_payments',
      'student_fees',
      'audit_logs',
      'batch_enrollments',
      'batches',
      'students',
      'class_levels',
      'member_permission_overrides',
      'workspace_members',
      'workspace_settings',
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

  it("records a single full payment, calculates dueAmount=0.00, sets status='paid', and formats receipt", async () => {
    const { fee } = await createTestEnrollmentAndFee({ amount: '150000', discount: '30000' }); // Expected: 1500.00, Disc: 300.00 -> Net due: 1200.00
    expect(fee.dueAmount).toBe('1200.00');
    expect(fee.status).toBe('unpaid');

    const response = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '1200.00',
        paymentMethod: 'bkash',
        note: 'Full payment via bKash',
      })
      .expect(201);

    expect(response.body.data.payment).toMatchObject({
      studentId: studentA,
      studentFeeId: fee.id,
      amount: '1200.00',
      paymentMethod: 'bkash',
      note: 'Full payment via bKash',
    });
    expect(response.body.data.payment.receiptNumber).toMatch(/^TEST-\d{6}-\d{4}$/);
    expect(response.body.data.fee).toMatchObject({
      id: fee.id,
      paidAmount: '1200.00',
      dueAmount: '0.00',
      status: 'paid',
    });

    // Check DB row
    const dbFee = (await pool.query('SELECT * FROM student_fees WHERE id = $1', [fee.id])).rows[0];
    expect(dbFee.paid_amount).toBe('1200.00');
    expect(dbFee.due_amount).toBe('0.00');
    expect(dbFee.status).toBe('paid');

    // Check audit log
    const audits = (
      await pool.query(
        "SELECT * FROM audit_logs WHERE workspace_id = $1 AND entity_id = $2 AND action = 'fees.payment_recorded'",
        [workspaceA, response.body.data.payment.id]
      )
    ).rows;
    expect(audits.length).toBe(1);
    expect(audits[0].metadata).toMatchObject({
      feeId: fee.id,
      amount: '1200.00',
      paymentMethod: 'bkash',
      newStatus: 'paid',
    });
  });

  it('records partial payments and accumulates them until fully paid', async () => {
    const { fee } = await createTestEnrollmentAndFee({ amount: '200000', discount: '0' }); // Net due: 2000.00

    // First partial payment: 500.00
    const part1 = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '500.00',
        paymentMethod: 'cash',
      })
      .expect(201);

    expect(part1.body.data.fee).toMatchObject({
      paidAmount: '500.00',
      dueAmount: '1500.00',
      status: 'partially_paid',
    });

    // Second partial payment: 1000.00
    const part2 = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '1000.00',
        paymentMethod: 'nagad',
      })
      .expect(201);

    expect(part2.body.data.fee).toMatchObject({
      paidAmount: '1500.00',
      dueAmount: '500.00',
      status: 'partially_paid',
    });

    // Final completing payment: 500.00
    const part3 = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '500.00',
        paymentMethod: 'rocket',
      })
      .expect(201);

    expect(part3.body.data.fee).toMatchObject({
      paidAmount: '2000.00',
      dueAmount: '0.00',
      status: 'paid',
    });

    // List payments for fee
    const feePayments = await request(app)
      .get(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .expect(200);

    expect(feePayments.body.data.length).toBe(3);
    expect(feePayments.body.data.map((p) => p.paymentMethod)).toEqual(['rocket', 'nagad', 'cash']);
  });

  it('rejects excess payment beyond the remaining due balance', async () => {
    const { fee } = await createTestEnrollmentAndFee({ amount: '100000', discount: '20000' }); // Due: 800.00

    const errorRes = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '800.01',
        paymentMethod: 'cash',
      })
      .expect(409);

    expect(errorRes.body.error.code).toBe('EXCESS_PAYMENT_NOT_ALLOWED');

    // Fee balance remains untouched
    const dbFee = (await pool.query('SELECT * FROM student_fees WHERE id = $1', [fee.id])).rows[0];
    expect(dbFee.paid_amount).toBe('0.00');
    expect(dbFee.due_amount).toBe('800.00');
  });

  it('rejects payment on already fully paid and waived fees', async () => {
    // 1. Fully paid fee
    const { fee: paidFee } = await createTestEnrollmentAndFee({ amount: '100000', discount: '0' });
    await request(app)
      .post(`/api/v1/student-fees/${paidFee.id}/payments`)
      .set(headers())
      .send({ amount: '1000.00', paymentMethod: 'cash' })
      .expect(201);

    const tryPayPaid = await request(app)
      .post(`/api/v1/student-fees/${paidFee.id}/payments`)
      .set(headers())
      .send({ amount: '10.00', paymentMethod: 'cash' })
      .expect(409);
    expect(tryPayPaid.body.error.code).toBe('FEE_ALREADY_PAID');

    // 2. Waived fee (100% discount)
    const { fee: waivedFee } = await createTestEnrollmentAndFee({
      amount: '50000',
      discount: '50000',
    });
    expect(waivedFee.status).toBe('waived');

    const tryPayWaived = await request(app)
      .post(`/api/v1/student-fees/${waivedFee.id}/payments`)
      .set(headers())
      .send({ amount: '50.00', paymentMethod: 'cash' })
      .expect(409);
    expect(tryPayWaived.body.error.code).toBe('FEE_ALREADY_WAIVED');
  });

  it('accepts and validates caller-supplied custom receipt numbers, rejecting duplicates in the same workspace', async () => {
    const { fee } = await createTestEnrollmentAndFee({ amount: '200000', discount: '0' });

    const customReceipt = `CUSTOM-REC-${randomUUID().slice(0, 8).toUpperCase()}`;

    const res = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '100.00',
        paymentMethod: 'other',
        receiptNumber: customReceipt,
      })
      .expect(201);

    expect(res.body.data.payment.receiptNumber).toBe(customReceipt);

    // Second payment with the identical receipt number
    const dupRes = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '100.00',
        paymentMethod: 'other',
        receiptNumber: customReceipt,
      })
      .expect(409);

    expect(dupRes.body.error.code).toBe('DUPLICATE_RECEIPT_NUMBER');
  });

  it('retrieves student payment history and single payment/receipt detail endpoints', async () => {
    const { fee } = await createTestEnrollmentAndFee({ amount: '100000', discount: '0' });

    const payRes = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers())
      .send({
        amount: '250.00',
        paymentMethod: 'cash',
        note: 'Detail test payment',
      })
      .expect(201);

    const paymentId = payRes.body.data.payment.id;
    const receiptNumber = payRes.body.data.payment.receiptNumber;

    // 1. Get by payment ID
    const byId = await request(app)
      .get(`/api/v1/student-payments/${paymentId}`)
      .set(headers())
      .expect(200);

    expect(byId.body.data).toMatchObject({
      id: paymentId,
      amount: '250.00',
      receiptNumber,
      note: 'Detail test payment',
      student: { id: studentA, studentCode: 'PAY-001' },
      fee: { id: fee.id, expectedAmount: '1000.00' },
    });

    // 2. Get by receipt number
    const byReceipt = await request(app)
      .get(`/api/v1/student-payments/receipts/${receiptNumber}`)
      .set(headers())
      .expect(200);

    expect(byReceipt.body.data).toEqual(byId.body.data);

    // 3. Student payment history
    const history = await request(app)
      .get(`/api/v1/students/${studentA}/payments`)
      .set(headers())
      .expect(200);

    expect(history.body.data.length).toBeGreaterThanOrEqual(1);
    expect(history.body.meta).toHaveProperty('total');
  });

  it('blocks cross-workspace payment recording and receipt access', async () => {
    const { fee: feeB } = await createTestEnrollmentAndFee({
      workspaceId: workspaceB,
      amount: '100000',
      discount: '0',
    });

    // Workspace A owner tries to record payment on Workspace B's fee
    await request(app)
      .post(`/api/v1/student-fees/${feeB.id}/payments`)
      .set(headers(workspaceA)) // Requesting under Workspace A
      .send({
        amount: '100.00',
        paymentMethod: 'cash',
      })
      .expect(404);

    // Record legitimate payment in Workspace B
    const bPay = await pool.query(
      "INSERT INTO student_payments (workspace_id, student_id, student_fee_id, amount, payment_method, receipt_number) VALUES ($1, $2, $3, '100.00', 'cash', 'WSB-001') RETURNING id, receipt_number",
      [workspaceB, studentB, feeB.id]
    );
    const bPaymentId = bPay.rows[0].id;

    // Workspace A owner cannot view Workspace B's payment by ID
    await request(app)
      .get(`/api/v1/student-payments/${bPaymentId}`)
      .set(headers(workspaceA))
      .expect(404);

    // Workspace A owner cannot view Workspace B's receipt by receiptNumber
    await request(app)
      .get('/api/v1/student-payments/receipts/WSB-001')
      .set(headers(workspaceA))
      .expect(404);
  });

  it('enforces fees.collect and fees.view permissions for non-owner members', async () => {
    const { fee } = await createTestEnrollmentAndFee({ amount: '100000', discount: '0' });

    // 1. Restricted user without fees.collect cannot record payment
    await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers(workspaceA, restrictedCookie))
      .send({ amount: '100.00', paymentMethod: 'cash' })
      .expect(403);

    // 2. Grant fees.collect (1403) override to restricted user
    await pool.query(
      'INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, $3, true)',
      [workspaceA, memberId, studentFeePermissions.collect.code]
    );

    // Now restricted user can record payment
    const recordSuccess = await request(app)
      .post(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers(workspaceA, restrictedCookie))
      .send({ amount: '100.00', paymentMethod: 'cash' })
      .expect(201);

    expect(recordSuccess.body.data.payment.amount).toBe('100.00');

    // Restricted user still cannot view payments without fees.view (1401)
    await request(app)
      .get(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers(workspaceA, restrictedCookie))
      .expect(403);

    // Grant fees.view (1401) override
    await pool.query(
      'INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1, $2, $3, true)',
      [workspaceA, memberId, studentFeePermissions.view.code]
    );

    await request(app)
      .get(`/api/v1/student-fees/${fee.id}/payments`)
      .set(headers(workspaceA, restrictedCookie))
      .expect(200);
  });
});
