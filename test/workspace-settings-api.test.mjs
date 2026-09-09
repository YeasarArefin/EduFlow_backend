import request from 'supertest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/backend/src/app.js');
const { env } = require('../dist/backend/src/config/env.js');
const app = createApp();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const workspaceA = randomUUID(),
  workspaceB = randomUUID(),
  planId = randomUUID(),
  suffix = randomUUID();
let ownerId, ownerCookie, memberId, memberCookie;
const headers = (workspaceId = workspaceA, cookie = ownerCookie) => ({
  Cookie: cookie,
  'X-Workspace-Id': workspaceId,
});

describe('workspace settings API', () => {
  beforeAll(async () => {
    for (const isMember of [false, true]) {
      const email = `settings-${isMember}-${suffix}@example.test`;
      const signup = await request(app)
        .post('/api/auth/sign-up/email')
        .send({ name: 'Settings User', email, password: 'safe-test-password' })
        .expect(200);
      const signin = await request(app)
        .post('/api/auth/sign-in/email')
        .send({ email, password: 'safe-test-password' })
        .expect(200);
      if (isMember) {
        memberId = signup.body.user.id;
        memberCookie = signin.headers['set-cookie'][0];
      } else {
        ownerId = signup.body.user.id;
        ownerCookie = signin.headers['set-cookie'][0];
      }
    }
    await pool.query(
      "INSERT INTO plans (id,name,slug,duration_days,trial_days) VALUES ($1,'Settings Plan',$2,30,0)",
      [planId, `settings-${suffix}`]
    );
    for (const [id, name] of [
      [workspaceA, 'Settings A'],
      [workspaceB, 'Settings B'],
    ]) {
      await pool.query("INSERT INTO workspaces (id,name,slug,status) VALUES ($1,$2,$3,'active')", [
        id,
        name,
        id,
      ]);
      await pool.query('INSERT INTO workspace_settings (workspace_id) VALUES ($1)', [id]);
      await pool.query(
        "INSERT INTO subscriptions (workspace_id,plan_id,status,expires_at) VALUES ($1,$2,'active',now()+interval '30 days')",
        [id, planId]
      );
    }
    await pool.query(
      'INSERT INTO workspace_members (workspace_id,user_id,role_code) VALUES ($1,$2,101),($1,$3,201)',
      [workspaceA, ownerId, memberId]
    );
    const membershipId = (
      await pool.query('SELECT id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [
        workspaceA,
        memberId,
      ])
    ).rows[0].id;
    await pool.query(
      'INSERT INTO member_permission_overrides (workspace_id,member_id,permission_code,allowed) VALUES ($1,$2,1103,true)',
      [workspaceA, membershipId]
    );
  });

  afterAll(async () => {
    for (const table of [
      'audit_logs',
      'member_permission_overrides',
      'workspace_members',
      'workspace_settings',
      'subscriptions',
    ])
      await pool.query(`DELETE FROM ${table} WHERE workspace_id IN ($1,$2)`, [
        workspaceA,
        workspaceB,
      ]);
    await pool.query('DELETE FROM workspaces WHERE id IN ($1,$2)', [workspaceA, workspaceB]);
    await pool.query('DELETE FROM plans WHERE id=$1', [planId]);
    await pool.query('DELETE FROM "user" WHERE id IN ($1,$2)', [ownerId, memberId]);
    await pool.end();
  });

  it('loads and updates only the server-resolved workspace', async () => {
    const updated = await request(app)
      .patch('/api/v1/workspace-settings')
      .set(headers())
      .send({
        name: 'Updated Center',
        defaultFeeDueDay: 12,
        gracePeriodDays: 5,
        receiptPrefix: 'UCD',
        smsDefaultSenderId: 'EDUFLOW',
        paymentReminderEnabled: false,
        absenceEmailRecipient: 'both',
      })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      workspaceId: workspaceA,
      name: 'Updated Center',
      defaultFeeDueDay: 12,
      gracePeriodDays: 5,
      receiptPrefix: 'UCD',
      smsDefaultSenderId: 'EDUFLOW',
      paymentReminderEnabled: false,
      absenceEmailRecipient: 'both',
    });
    expect(
      (await request(app).get('/api/v1/workspace-settings').set(headers()).expect(200)).body.data
        .name
    ).toBe('Updated Center');
    expect(
      (await pool.query('SELECT name FROM workspaces WHERE id=$1', [workspaceB])).rows[0].name
    ).toBe('Settings B');
  });

  it('rejects unknown fields and invalid setting values', async () => {
    await request(app)
      .patch('/api/v1/workspace-settings')
      .set(headers())
      .send({ workspaceId: workspaceB })
      .expect(400);
    await request(app)
      .patch('/api/v1/workspace-settings')
      .set(headers())
      .send({ defaultFeeDueDay: 32 })
      .expect(400);
    await request(app)
      .patch('/api/v1/workspace-settings')
      .set(headers())
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('requires the Workspace Owner even when a member can update students', async () => {
    await request(app)
      .get('/api/v1/workspace-settings')
      .set(headers(workspaceA, memberCookie))
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('WORKSPACE_OWNER_REQUIRED'));
    await request(app)
      .patch('/api/v1/workspace-settings')
      .set(headers(workspaceA, memberCookie))
      .send({ name: 'Leaked update' })
      .expect(403);
    await request(app).get('/api/v1/workspace-settings').set(headers(workspaceB)).expect(403);
  });
});
