import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/backend/src/app.js');
const { pool } = require('../dist/backend/src/database/client.js');
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `change-password-${suffix}@example.test`;
const currentPassword = 'current-safe-password';
const newPassword = 'new-safe-password';
const workspaceId = randomUUID();
const membershipId = randomUUID();

describe('Better Auth change password', () => {
  const app = createApp();
  let userId;

  afterAll(async () => {
    await pool.query('DELETE FROM workspace_members WHERE id = $1', [membershipId]);
    await pool.query('DELETE FROM sms_wallets WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
    await pool.end();
  });

  it('verifies the current password, rotates the current session, and revokes other sessions', async () => {
    const signUpResponse = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Change Password Test User', email, password: currentPassword })
      .expect(200);
    userId = signUpResponse.body.user.id;
    const currentCookie = signUpResponse.headers['set-cookie']?.[0];
    expect(currentCookie).toBeTruthy();

    await pool.query(
      "INSERT INTO workspaces (id, name, slug, status) VALUES ($1, $2, $3, 'active')",
      [workspaceId, 'Change Password Workspace', `change-password-${suffix}`]
    );
    await pool.query(
      'INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, 101)',
      [membershipId, workspaceId, userId]
    );

    const otherSessionId = randomUUID();
    await pool.query(
      `INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
       VALUES ($1, now() + interval '1 day', $2, now(), now(), $3)`,
      [otherSessionId, randomUUID(), userId]
    );

    const wrongPasswordResponse = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', currentCookie)
      .set('X-Forwarded-For', '198.51.100.40')
      .send({
        currentPassword: 'incorrect-current-password',
        newPassword,
        revokeOtherSessions: true,
      })
      .expect(400);
    expect(wrongPasswordResponse.body.code).toBe('INVALID_PASSWORD');

    const changedResponse = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', currentCookie)
      .set('X-Forwarded-For', '198.51.100.40')
      .send({ currentPassword, newPassword, revokeOtherSessions: true })
      .expect(200);
    const replacementCookie = changedResponse.headers['set-cookie']?.[0];
    expect(replacementCookie).toBeTruthy();

    const sessions = await pool.query('SELECT id FROM session WHERE user_id = $1', [userId]);
    expect(sessions.rowCount).toBe(1);
    expect(sessions.rows[0].id).not.toBe(otherSessionId);

    const oldSessionResponse = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', currentCookie)
      .expect(200);
    expect(oldSessionResponse.body).toBeNull();

    const currentSessionResponse = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', replacementCookie)
      .expect(200);
    expect(currentSessionResponse.body.user.id).toBe(userId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', replacementCookie)
        .set('X-Forwarded-For', '198.51.100.41')
        .send({
          currentPassword: 'incorrect-current-password',
          newPassword: 'another-safe-password',
          revokeOtherSessions: true,
        })
        .expect(400);
    }

    await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', replacementCookie)
      .set('X-Forwarded-For', '198.51.100.41')
      .send({
        currentPassword: 'incorrect-current-password',
        newPassword: 'another-safe-password',
        revokeOtherSessions: true,
      })
      .expect(429);

    await request(app).post('/api/auth/sign-out').set('Cookie', replacementCookie).expect(200);
    await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: currentPassword })
      .expect(401);
    await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: newPassword })
      .expect(200);
  });
});
