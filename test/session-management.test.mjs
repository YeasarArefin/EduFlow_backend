import { createRequire } from 'node:module';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');
const { pool } = require('../dist/src/database/client.js');

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `session-test-${suffix}@example.test`;
const password = 'Password123!';

describe('Active Device Session Limit & Takeover Flow', () => {
  const app = createApp();
  let userId;
  let session1Cookie;
  let session2Cookie;
  let session3Cookie;

  beforeAll(async () => {
    // Register test user
    const signUpResponse = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Session Limit Tester', email, password })
      .expect(200);

    userId = signUpResponse.body.user.id;

    // Mark email as verified for testing
    await pool.query('UPDATE "user" SET email_verified = true WHERE id = $1', [userId]);

    // Clear initial sign-up session so we test cleanly from 0 sessions
    await pool.query('DELETE FROM "session" WHERE user_id = $1', [userId]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM "session" WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM "account" WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  it('allows 1st device login', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')
      .send({ email, password })
      .expect(200);

    session1Cookie = res.headers['set-cookie']?.[0];
    expect(session1Cookie).toBeTruthy();

    const countRes = await pool.query('SELECT count(*) FROM "session" WHERE user_id = $1', [userId]);
    expect(Number(countRes.rows[0].count)).toBe(1);
  });

  it('allows 2nd device login', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15')
      .send({ email, password })
      .expect(200);

    session2Cookie = res.headers['set-cookie']?.[0];
    expect(session2Cookie).toBeTruthy();

    const countRes = await pool.query('SELECT count(*) FROM "session" WHERE user_id = $1', [userId]);
    expect(Number(countRes.rows[0].count)).toBe(2);
  });

  it('lists active sessions with device labels and current session status', async () => {
    const res = await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session1Cookie)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    const current = res.body.data.find((s) => s.isCurrent);
    const other = res.body.data.find((s) => !s.isCurrent);

    expect(current).toBeDefined();
    expect(current.deviceLabel).toContain('Chrome');
    expect(other).toBeDefined();
    expect(other.deviceLabel).toContain('Safari');
  });

  it('blocks 3rd device login with 403 SESSION_LIMIT_REACHED and lists active sessions', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
      .send({ email, password })
      .expect(403);

    expect(res.body.code).toBe('SESSION_LIMIT_REACHED');
    expect(res.body.sessionLimit).toBe(2);
    expect(res.body.activeSessions).toHaveLength(2);
  });

  it('allows querying active devices with credentials without an active cookie', async () => {
    const res = await request(app)
      .post('/api/v1/sessions/active-devices')
      .send({ email, password })
      .expect(200);

    expect(res.body.data).toHaveLength(2);
  });

  it('rejects active-devices query with invalid credentials', async () => {
    await request(app)
      .post('/api/v1/sessions/active-devices')
      .send({ email, password: 'WrongPassword!' })
      .expect(401);
  });

  it('performs session takeover: revokes all previous sessions and logs in the new device', async () => {
    const res = await request(app)
      .post('/api/v1/sessions/takeover')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
      .send({ email, password })
      .expect(200);

    session3Cookie = res.headers['set-cookie']?.[0];
    expect(session3Cookie).toBeTruthy();
    expect(res.body.data.user.email).toBe(email);

    // Verify previous sessions are revoked and only 1 active session exists now
    const listRes = await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session3Cookie)
      .expect(200);

    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].deviceLabel).toContain('iOS');
    expect(listRes.body.data[0].isCurrent).toBe(true);

    // Verify old session cookies are rejected
    await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session1Cookie)
      .expect(401);

    await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session2Cookie)
      .expect(401);
  });

  it('allows another device login after takeover (now 2 sessions again)', async () => {
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0')
      .send({ email, password })
      .expect(200);

    const session4Cookie = res.headers['set-cookie']?.[0];
    expect(session4Cookie).toBeTruthy();

    const listRes = await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session3Cookie)
      .expect(200);

    expect(listRes.body.data).toHaveLength(2);
  });

  it('allows individual session revocation', async () => {
    const listRes = await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session3Cookie)
      .expect(200);

    const otherSession = listRes.body.data.find((s) => !s.isCurrent);
    expect(otherSession).toBeDefined();

    await request(app)
      .delete(`/api/v1/sessions/${otherSession.id}`)
      .set('Cookie', session3Cookie)
      .expect(204);

    const afterRes = await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session3Cookie)
      .expect(200);

    expect(afterRes.body.data).toHaveLength(1);
    expect(afterRes.body.data[0].isCurrent).toBe(true);
  });

  it('allows revoking all other sessions via DELETE /api/v1/sessions/other', async () => {
    // Log in a second session
    await request(app)
      .post('/api/auth/sign-in/email')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0')
      .send({ email, password })
      .expect(200);

    // Revoke other
    await request(app)
      .delete('/api/v1/sessions/other')
      .set('Cookie', session3Cookie)
      .expect(204);

    const afterRes = await request(app)
      .get('/api/v1/sessions')
      .set('Cookie', session3Cookie)
      .expect(200);

    expect(afterRes.body.data).toHaveLength(1);
    expect(afterRes.body.data[0].isCurrent).toBe(true);
  });

  it('ignores expired sessions when calculating the active session count', async () => {
    // Insert an expired session directly into DB
    const expiredId = randomUUID();
    const expiredToken = randomUUID();
    await pool.query(
      'INSERT INTO "session" (id, token, user_id, expires_at, created_at, updated_at) VALUES ($1, $2, $3, now() - interval \'1 hour\', now() - interval \'2 hours\', now() - interval \'1 hour\')',
      [expiredId, expiredToken, userId]
    );

    // The user currently has 1 active session and 1 expired session.
    // A second active login must succeed because the limit is 2 active sessions.
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
      .send({ email, password })
      .expect(200);

    expect(res.headers['set-cookie']?.[0]).toBeTruthy();

    // Now user has 2 active sessions + 1 expired session. A third login must be blocked.
    await request(app)
      .post('/api/auth/sign-in/email')
      .set('User-Agent', 'Mozilla/5.0 (Android; Mobile)')
      .send({ email, password })
      .expect(403);
  });
});
