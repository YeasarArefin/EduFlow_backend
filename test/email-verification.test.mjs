import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/backend/src/app.js');
const { pool } = require('../dist/backend/src/database/client.js');

const app = createApp();
const suffix = randomUUID();
const verifiedEmail = `verification-${suffix}@example.test`;
const resendEmail = `verification-resend-${suffix}@example.test`;
const sentEmails = [];
const originalFetch = globalThis.fetch;
let verifiedUserId;
let verifiedCookie;
let resendCookie;

function verificationLinkFrom(email) {
  const match = email.htmlContent.match(/href="([^"]+)"/);
  return match?.[1].replaceAll('&amp;', '&');
}

describe('Better Auth email verification', () => {
  beforeAll(() => {
    globalThis.fetch = async (_input, init) => {
      sentEmails.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ messageId: 'test-message-id' }), { status: 201 });
    };
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await pool.query('DELETE FROM "user" WHERE email IN ($1, $2)', [verifiedEmail, resendEmail]);
    await pool.end();
  });

  it('verifies the sign-up link and keeps an already verified account protected', async () => {
    const signup = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Email Verification Test User', email: verifiedEmail, password: 'safe-test-password' })
      .expect(200);
    verifiedUserId = signup.body.user.id;
    verifiedCookie = signup.headers['set-cookie'][0];

    const sentEmail = sentEmails.find(
      (email) => email.subject === 'Verify your EduFlow email address' && email.to[0]?.email === verifiedEmail
    );
    const verificationLink = sentEmail && verificationLinkFrom(sentEmail);
    expect(verificationLink).toBeTruthy();

    const verificationUrl = new URL(verificationLink);
    await request(app)
      .get(`${verificationUrl.pathname}${verificationUrl.search}`)
      .set('Cookie', verifiedCookie)
      .expect(302);

    const user = await pool.query('SELECT email_verified FROM "user" WHERE id = $1', [verifiedUserId]);
    expect(user.rows[0].email_verified).toBe(true);

    await request(app)
      .post('/api/auth/send-verification-email')
      .set('Cookie', verifiedCookie)
      .send({ email: verifiedEmail, callbackURL: 'http://localhost:3000/verify-email' })
      .expect(400);
  });

  it('returns the same response for a known and unknown email, and limits resend requests', async () => {
    const signup = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Email Resend Test User', email: resendEmail, password: 'safe-test-password' })
      .expect(200);
    resendCookie = signup.headers['set-cookie'][0];

    const knownResponse = await request(app)
      .post('/api/auth/send-verification-email')
      .set('Cookie', resendCookie)
      .set('X-Forwarded-For', '198.51.100.82')
      .send({ email: resendEmail, callbackURL: 'http://localhost:3000/verify-email' })
      .expect(200);
    const unknownResponse = await request(app)
      .post('/api/auth/send-verification-email')
      .set('X-Forwarded-For', '198.51.100.83')
      .send({
        email: `unknown-verification-${suffix}@example.test`,
        callbackURL: 'http://localhost:3000/verify-email',
      })
      .expect(200);
    expect(unknownResponse.body).toEqual(knownResponse.body);

    for (let attempt = 0; attempt < 7; attempt += 1) {
      await request(app)
        .post('/api/auth/send-verification-email')
        .set('Cookie', resendCookie)
        .set('X-Forwarded-For', '198.51.100.82')
        .send({ email: resendEmail, callbackURL: 'http://localhost:3000/verify-email' })
        .expect(200);
    }

    await request(app)
      .post('/api/auth/send-verification-email')
      .set('Cookie', resendCookie)
      .set('X-Forwarded-For', '198.51.100.82')
      .send({ email: resendEmail, callbackURL: 'http://localhost:3000/verify-email' })
      .expect(429);
  });
});
