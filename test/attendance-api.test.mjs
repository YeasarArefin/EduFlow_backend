import request from 'supertest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/backend/src/app.js');
const { env } = require('../dist/backend/src/config/env.js');
const { attendancePermissions } = require('../dist/backend/src/config/attendance.js');
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const workspaceA = randomUUID(),
  workspaceB = randomUUID(),
  planId = randomUUID(),
  suffix = randomUUID();
let ownerId,
  cookie,
  restrictedId,
  restrictedCookie,
  restrictedMemberId,
  classA,
  classB,
  batchA,
  batchB,
  activeStudent,
  futureStudent,
  inactiveEnrollmentStudent,
  inactiveStudent,
  endedStudent;
const headers = (workspaceId = workspaceA, session = cookie) => ({
  Cookie: session,
  'X-Workspace-Id': workspaceId,
});
const createSession = (body, session = cookie, workspaceId = workspaceA) =>
  request(app).post('/api/v1/attendance-sessions').set(headers(workspaceId, session)).send(body);

async function student(workspaceId, code, status = 'active') {
  return (
    await pool.query(
      'INSERT INTO students (workspace_id, student_code, full_name, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [workspaceId, code, `Student ${code}`, status]
    )
  ).rows[0].id;
}

describe('attendance sessions and records API', () => {
  beforeAll(async () => {
    for (const restricted of [false, true]) {
      const email = `attendance-${restricted}-${suffix}@example.test`;
      const signup = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ name: 'Attendance Test User', email, password: 'safe-test-password' })
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
    await pool.query(
      "INSERT INTO plans (id, name, slug, duration_days, trial_days) VALUES ($1, 'Attendance Plan', $2, 30, 0)",
      [planId, suffix]
    );
    for (const workspaceId of [workspaceA, workspaceB]) {
      await pool.query(
        "INSERT INTO workspaces (id, name, slug, status) VALUES ($1::uuid, 'Attendance Workspace', $1::text, 'active')",
        [workspaceId]
      );
      await pool.query(
        "INSERT INTO subscriptions (workspace_id, plan_id, status, starts_at, expires_at) VALUES ($1, $2, 'active', now() - interval '1 day', now() + interval '30 days')",
        [workspaceId, planId]
      );
      const classId = (
        await pool.query(
          "INSERT INTO class_levels (workspace_id, name) VALUES ($1, 'Attendance Class') RETURNING id",
          [workspaceId]
        )
      ).rows[0].id;
      const batchId = (
        await pool.query(
          'INSERT INTO batches (workspace_id, name, class_level_id) VALUES ($1, $2, $3) RETURNING id',
          [workspaceId, `Attendance Batch ${workspaceId}`, classId]
        )
      ).rows[0].id;
      if (workspaceId === workspaceA) {
        classA = classId;
        batchA = batchId;
      } else {
        classB = classId;
        batchB = batchId;
      }
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
    activeStudent = await student(workspaceA, 'ATT-ACTIVE');
    futureStudent = await student(workspaceA, 'ATT-FUTURE');
    inactiveEnrollmentStudent = await student(workspaceA, 'ATT-INACTIVE-ENROLLMENT');
    inactiveStudent = await student(workspaceA, 'ATT-INACTIVE-STUDENT', 'inactive');
    endedStudent = await student(workspaceA, 'ATT-ENDED');
    const otherStudent = await student(workspaceB, 'ATT-OTHER');
    await pool.query(
      "INSERT INTO batch_enrollments (workspace_id, batch_id, student_id, status, enrolled_at) VALUES ($1,$2,$3,'active','2026-01-01'),($1,$2,$4,'active','2026-10-01'),($1,$2,$5,'inactive','2026-01-01'),($1,$2,$6,'active','2026-01-01'),($1,$2,$7,'active','2026-01-01')",
      [
        workspaceA,
        batchA,
        activeStudent,
        futureStudent,
        inactiveEnrollmentStudent,
        inactiveStudent,
        endedStudent,
      ]
    );
    await pool.query(
      "UPDATE batch_enrollments SET ended_at = '2026-08-31' WHERE workspace_id = $1 AND student_id = $2",
      [workspaceA, endedStudent]
    );
    await pool.query(
      "INSERT INTO batch_enrollments (workspace_id, batch_id, student_id, status, enrolled_at) VALUES ($1,$2,$3,'active','2026-01-01')",
      [workspaceB, batchB, otherStudent]
    );
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Test fixtures deliberately exercise immutable finalized rows. PostgreSQL
      // superuser cleanup bypasses their protection only within this transaction.
      await client.query('SET LOCAL session_replication_role = replica');
      for (const table of [
        'attendance_records',
        'attendance_sessions',
        'audit_logs',
        'batch_enrollments',
        'batches',
        'students',
        'class_levels',
        'member_permission_overrides',
        'workspace_members',
        'subscriptions',
      ])
        await client.query(`DELETE FROM ${table} WHERE workspace_id IN ($1, $2)`, [
          workspaceA,
          workspaceB,
        ]);
      await client.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceA, workspaceB]);
      await client.query('DELETE FROM plans WHERE id = $1', [planId]);
      await client.query('DELETE FROM "user" WHERE id IN ($1, $2)', [ownerId, restrictedId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await pool.end();
  });

  it('creates a draft session with exactly the active, date-eligible enrollment roster', async () => {
    const response = await createSession({ batchId: batchA, sessionDate: '2026-09-01' }).expect(
      201
    );
    expect(response.body.data).toMatchObject({
      batchId: batchA,
      sessionDate: '2026-09-01',
      status: 'draft',
      batch: { id: batchA },
    });
    expect(response.body.data.records).toEqual([
      expect.objectContaining({
        studentId: activeStudent,
        status: 'absent',
        student: expect.objectContaining({ studentCode: 'ATT-ACTIVE' }),
      }),
    ]);
    expect(response.body.data.records).toHaveLength(1);
    await pool.query(
      "UPDATE batch_enrollments SET status = 'archived' WHERE workspace_id = $1 AND student_id = $2",
      [workspaceA, activeStudent]
    );
    const reread = await request(app)
      .get(`/api/v1/attendance-sessions/${response.body.data.id}`)
      .set(headers())
      .expect(200);
    expect(reread.body.data.records).toHaveLength(1);
    await pool.query(
      "UPDATE batch_enrollments SET status = 'active' WHERE workspace_id = $1 AND student_id = $2",
      [workspaceA, activeStudent]
    );
  });

  it('creates an empty but valid roster when a batch has no active date-eligible enrollments', async () => {
    const emptyBatch = (
      await pool.query(
        'INSERT INTO batches (workspace_id, name, class_level_id) VALUES ($1, $2, $3) RETURNING id',
        [workspaceA, `Empty Attendance ${suffix}`, classA]
      )
    ).rows[0].id;
    const response = await createSession({ batchId: emptyBatch, sessionDate: '2026-09-01' }).expect(
      201
    );
    expect(response.body.data.records).toEqual([]);
  });

  it('allows a past class day and rejects non-class and future attendance dates', async () => {
    const scheduledBatch = (
      await pool.query(
        "INSERT INTO batches (workspace_id, name, class_level_id, class_days) VALUES ($1, $2, $3, ARRAY[2]::smallint[]) RETURNING id",
        [workspaceA, `Tuesday Attendance ${suffix}`, classA]
      )
    ).rows[0].id;
    await createSession({ batchId: scheduledBatch, sessionDate: '2026-09-08' }).expect(201);
    await createSession({ batchId: scheduledBatch, sessionDate: '2026-09-07' })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('ATTENDANCE_DATE_NOT_CLASS_DAY'));
    await createSession({ batchId: scheduledBatch, sessionDate: '2026-09-10' })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('ATTENDANCE_DATE_IN_FUTURE'));
  });

  it('rejects duplicate batch/date sessions and wrong or inactive batches', async () => {
    await createSession({ batchId: batchA, sessionDate: '2026-09-02' }).expect(201);
    await createSession({ batchId: batchA, sessionDate: '2026-09-02' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('ATTENDANCE_SESSION_ALREADY_EXISTS'));
    await createSession({ batchId: batchB, sessionDate: '2026-09-02' }).expect(404);
    const inactiveBatch = (
      await pool.query(
        "INSERT INTO batches (workspace_id, name, class_level_id, status) VALUES ($1, $2, $3, 'inactive') RETURNING id",
        [workspaceA, `Inactive Attendance ${suffix}`, classA]
      )
    ).rows[0].id;
    await createSession({ batchId: inactiveBatch, sessionDate: '2026-09-02' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('BATCH_NOT_ACTIVE'));
  });

  it('bulk saves only roster records and leaves non-submitted records unchanged', async () => {
    const secondStudent = await student(workspaceA, `ATT-SECOND-${suffix.slice(0, 12)}`);
    await pool.query(
      "INSERT INTO batch_enrollments (workspace_id, batch_id, student_id, status, enrolled_at) VALUES ($1,$2,$3,'active','2026-01-01')",
      [workspaceA, batchA, secondStudent]
    );
    const session = (
      await createSession({ batchId: batchA, sessionDate: '2026-09-03' }).expect(201)
    ).body.data;
    expect(session.records).toHaveLength(2);
    const saved = await request(app)
      .patch(`/api/v1/attendance-sessions/${session.id}/records`)
      .set(headers())
      .send({ records: [{ studentId: activeStudent, status: 'present' }] })
      .expect(200);
    expect(saved.body.data.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: activeStudent, status: 'present' }),
        expect.objectContaining({ studentId: secondStudent, status: 'absent' }),
      ])
    );
    await request(app)
      .patch(`/api/v1/attendance-sessions/${session.id}/records`)
      .set(headers())
      .send({ records: [{ studentId: futureStudent, status: 'present' }] })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('ATTENDANCE_ROSTER_MISMATCH'));
    const afterRejected = await request(app)
      .get(`/api/v1/attendance-sessions/${session.id}`)
      .set(headers())
      .expect(200);
    expect(
      afterRejected.body.data.records.find((record) => record.studentId === activeStudent).status
    ).toBe('present');
    await request(app)
      .patch(`/api/v1/attendance-sessions/${session.id}/records`)
      .set(headers())
      .send({
        records: [
          { studentId: activeStudent, status: 'present' },
          { studentId: activeStudent, status: 'absent' },
        ],
      })
      .expect(400);
  });

  it('finalizes a draft and makes its attendance records permanently read-only', async () => {
    const session = (
      await createSession({ batchId: batchA, sessionDate: '2026-09-04' }).expect(201)
    ).body.data;
    const finalized = await request(app)
      .post(`/api/v1/attendance-sessions/${session.id}/finalize`)
      .set(headers())
      .expect(200);
    expect(finalized.body.data.status).toBe('finalized');
    await request(app)
      .patch(`/api/v1/attendance-sessions/${session.id}/records`)
      .set(headers())
      .send({ records: [{ studentId: activeStudent, status: 'present' }] })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('ATTENDANCE_SESSION_FINALIZED'));
    await request(app)
      .post(`/api/v1/attendance-sessions/${session.id}/finalize`)
      .set(headers())
      .expect(409);
    const recordId = finalized.body.data.records.find(
      (record) => record.studentId === activeStudent
    ).id;
    await expect(
      pool.query("UPDATE attendance_records SET status = 'present' WHERE id = $1", [recordId])
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      pool.query("UPDATE attendance_sessions SET status = 'draft' WHERE id = $1", [session.id])
    ).rejects.toMatchObject({ code: '55000' });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_logs WHERE workspace_id = $1 AND entity_id = $2 AND action = 'attendance.session_finalized'",
          [workspaceA, session.id]
        )
      ).rows[0].n
    ).toBe(1);
  });

  it('lists workspace sessions with secure filters, date ordering, and attendance counts', async () => {
    const response = await request(app)
      .get('/api/v1/attendance-sessions')
      .set(headers())
      .query({ batchId: batchA, page: 1, limit: 2 })
      .expect(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].sessionDate >= response.body.data[1].sessionDate).toBe(true);
    expect(response.body.data[0]).toMatchObject({
      batch: { id: batchA },
      rosterCount: expect.any(Number),
      presentCount: expect.any(Number),
      absentCount: expect.any(Number),
    });
    const finalized = await request(app)
      .get('/api/v1/attendance-sessions')
      .set(headers())
      .query({ status: 'finalized' })
      .expect(200);
    expect(finalized.body.data.every((session) => session.status === 'finalized')).toBe(true);
    await request(app)
      .get('/api/v1/attendance-sessions')
      .set(headers())
      .query({ batchId: batchB })
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual([]));
  });

  it('validates inputs and does not accept client-owned workspace, records, or state', async () => {
    for (const body of [
      {},
      { batchId: batchA },
      { batchId: 'bad', sessionDate: '2026-09-01' },
      { batchId: batchA, sessionDate: '2026-09-31' },
      { batchId: batchA, sessionDate: '2026-09-01', workspaceId: workspaceB },
      { batchId: batchA, sessionDate: '2026-09-01', status: 'finalized' },
    ])
      await createSession(body).expect(400);
    await request(app)
      .get('/api/v1/attendance-sessions')
      .set(headers())
      .query({ page: 0 })
      .expect(400);
    await request(app).get('/api/v1/attendance-sessions/not-an-id').set(headers()).expect(400);
  });

  it('requires the precise attendance grants, active subscription, and workspace membership', async () => {
    const session = (
      await createSession({ batchId: batchA, sessionDate: '2026-09-05' }).expect(201)
    ).body.data;
    const calls = [
      ['get', '/api/v1/attendance-sessions'],
      ['post', '/api/v1/attendance-sessions', { batchId: batchA, sessionDate: '2026-09-06' }],
      ['get', `/api/v1/attendance-sessions/${session.id}`],
      [
        'patch',
        `/api/v1/attendance-sessions/${session.id}/records`,
        { records: [{ studentId: activeStudent, status: 'present' }] },
      ],
      ['post', `/api/v1/attendance-sessions/${session.id}/finalize`],
    ];
    for (const [method, url, body] of calls) {
      await request(app)[method](url).send(body).expect(401);
      await request(app)
        [method](url)
        .set(headers(workspaceA, restrictedCookie))
        .send(body)
        .expect(403);
    }
    await pool.query(
      'INSERT INTO member_permission_overrides (workspace_id, member_id, permission_code, allowed) VALUES ($1,$2,$3,true),($1,$2,$4,true),($1,$2,$5,true),($1,$2,$6,true)',
      [
        workspaceA,
        restrictedMemberId,
        attendancePermissions.view.code,
        attendancePermissions.mark.code,
        attendancePermissions.update.code,
        attendancePermissions.finalize.code,
      ]
    );
    await request(app)
      .get('/api/v1/attendance-sessions')
      .set(headers(workspaceA, restrictedCookie))
      .expect(200);
    await request(app)
      .patch(`/api/v1/attendance-sessions/${session.id}/records`)
      .set(headers(workspaceA, restrictedCookie))
      .send({ records: [{ studentId: activeStudent, status: 'present' }] })
      .expect(200);
    await pool.query(
      "UPDATE subscriptions SET expires_at = now() - interval '1 day' WHERE workspace_id = $1",
      [workspaceA]
    );
    try {
      await request(app).get('/api/v1/attendance-sessions').set(headers()).expect(403);
    } finally {
      await pool.query(
        "UPDATE subscriptions SET expires_at = now() + interval '30 days' WHERE workspace_id = $1",
        [workspaceA]
      );
    }
  });

  it('enforces workspace foreign keys, uniqueness, and forced RLS for records and sessions', async () => {
    const otherStudent = (
      await pool.query('SELECT student_id FROM batch_enrollments WHERE workspace_id = $1 LIMIT 1', [
        workspaceB,
      ])
    ).rows[0].student_id;
    const foreignSession = (
      await pool.query(
        "INSERT INTO attendance_sessions (workspace_id, batch_id, session_date) VALUES ($1,$2,'2026-09-01') RETURNING id",
        [workspaceB, batchB]
      )
    ).rows[0].id;
    const foreignRecord = (
      await pool.query(
        'INSERT INTO attendance_records (workspace_id, attendance_session_id, student_id) VALUES ($1,$2,$3) RETURNING id',
        [workspaceB, foreignSession, otherStudent]
      )
    ).rows[0].id;
    await expect(
      pool.query(
        "INSERT INTO attendance_sessions (workspace_id, batch_id, session_date) VALUES ($1,$2,'2026-09-01')",
        [workspaceB, batchB]
      )
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        'INSERT INTO attendance_records (workspace_id, attendance_session_id, student_id) VALUES ($1,$2,$3)',
        [workspaceB, foreignSession, otherStudent]
      )
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        'INSERT INTO attendance_records (workspace_id, attendance_session_id, student_id) VALUES ($1,$2,$3)',
        [workspaceA, foreignSession, activeStudent]
      )
    ).rejects.toMatchObject({ code: '23503' });
    const client = await pool.connect();
    try {
      const state = await client.query(
        "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid IN ('attendance_sessions'::regclass, 'attendance_records'::regclass)"
      );
      expect(state.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
      await client.query('SET ROLE eduflow_app');
      await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceA]);
      expect(
        (await client.query('SELECT id FROM attendance_sessions WHERE id = $1', [foreignSession]))
          .rows
      ).toEqual([]);
      expect(
        (await client.query('SELECT id FROM attendance_records WHERE id = $1', [foreignRecord]))
          .rows
      ).toEqual([]);
      expect(
        (
          await client.query("UPDATE attendance_sessions SET status = 'finalized' WHERE id = $1", [
            foreignSession,
          ])
        ).rowCount
      ).toBe(0);
      expect(
        (await client.query('DELETE FROM attendance_records WHERE id = $1', [foreignRecord]))
          .rowCount
      ).toBe(0);
      await expect(
        client.query(
          "INSERT INTO attendance_sessions (workspace_id, batch_id, session_date) VALUES ($1,$2,'2027-01-01')",
          [workspaceB, batchB]
        )
      ).rejects.toMatchObject({ code: '42501' });
      await client.query("SELECT set_config('app.workspace_id', '', false)");
      expect((await client.query('SELECT id FROM attendance_sessions')).rows).toEqual([]);
    } finally {
      await client.query('RESET ROLE');
      await client.query('RESET app.workspace_id');
      client.release();
    }
  });
});
