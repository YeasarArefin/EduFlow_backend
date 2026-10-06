import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');
const { pool } = require('../dist/src/database/client.js');
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `password-reset-${suffix}@example.test`;
const oldPassword = 'old-safe-test-password';
const newPassword = 'new-safe-test-password';
const sentEmails = [];
const originalFetch = globalThis.fetch;

function resetLinkFrom(emailInput) {
  const match = emailInput.htmlContent.match(/href="([^"]+)"/);
  return match?.[1].replaceAll('&amp;', '&');
}

describe('Better Auth password reset', () => {
  const app = createApp();
  let userId;

  beforeAll(() => {
    globalThis.fetch = async (_input, init) => {
      sentEmails.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ messageId: 'test-message-id' }), { status: 201 });
    };
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (userId) await pool.query('DELETE FROM verification WHERE value = $1', [userId]);
    await pool.query('DELETE FROM "user" WHERE email = $1', [email]);
    await pool.end();
  });

  it('uses a generic response for unknown emails and a one-time link for a secure reset', async () => {
    const signUpResponse = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Password Reset Test User', email, password: oldPassword })
      .expect(200);
    userId = signUpResponse.body.user.id;

    const oldSessionCookie = signUpResponse.headers['set-cookie']?.[0];
    expect(oldSessionCookie).toBeTruthy();

    const knownResponse = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email, redirectTo: 'http://localhost:3000/reset-password' })
      .expect(200);
    const unknownResponse = await request(app)
      .post('/api/auth/request-password-reset')
      .send({
        email: `unknown-${suffix}@example.test`,
        redirectTo: 'http://localhost:3000/reset-password',
      })
      .expect(200);

    expect(unknownResponse.body).toEqual(knownResponse.body);

    const passwordResetEmail = sentEmails.find(
      (emailInput) => emailInput.subject === 'Reset your EduFlow password'
    );
    const resetLink = passwordResetEmail && resetLinkFrom(passwordResetEmail);
    expect(resetLink).toBeTruthy();

    const callbackResponse = await request(app)
      .get(new URL(resetLink).pathname + new URL(resetLink).search)
      .expect(302);
    const token = new URL(callbackResponse.headers.location).searchParams.get('token');
    expect(token).toBeTruthy();

    await request(app).post('/api/auth/reset-password').send({ token, newPassword }).expect(200);

    await request(app).post('/api/auth/reset-password').send({ token, newPassword }).expect(400);

    const revokedSessionResponse = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', oldSessionCookie)
      .expect(200);
    expect(revokedSessionResponse.body).toBeNull();
    await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: oldPassword })
      .expect(401);
    await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: newPassword })
      .expect(200);
  });

  it('rejects expired reset links and rate limits requests by IP and email', async () => {
    const expiredToken = `expired-${randomUUID()}`;
    await pool.query(
      `INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, now() - interval '1 minute', now(), now())`,
      [randomUUID(), `reset-password:${expiredToken}`, userId]
    );

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: expiredToken, newPassword })
      .expect(400);

    const limitedEmail = `limited-${suffix}@example.test`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/auth/request-password-reset')
        .set('X-Forwarded-For', '198.51.100.24')
        .send({ email: limitedEmail, redirectTo: 'http://localhost:3000/reset-password' })
        .expect(200);
    }

    const limitedResponse = await request(app)
      .post('/api/auth/request-password-reset')
      .set('X-Forwarded-For', '198.51.100.24')
      .send({ email: limitedEmail, redirectTo: 'http://localhost:3000/reset-password' })
      .expect(429);

    expect(limitedResponse.body.message).toBe('Too many reset requests. Please try again later.');
  });
});
