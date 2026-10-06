import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');
const { pool } = require('../dist/src/database/client.js');

const app = createApp();
const suffix = randomUUID();
const accountEmail = `account-${suffix}@example.test`;
const otherEmail = `account-other-${suffix}@example.test`;
let accountUserId;
let otherUserId;
let accountCookie;

describe('account information', () => {
  beforeAll(async () => {
    const accountSignup = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Original Account Name', email: accountEmail, password: 'safe-test-password' })
      .expect(200);
    const otherSignup = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Other Account Name', email: otherEmail, password: 'safe-test-password' })
      .expect(200);
    accountUserId = accountSignup.body.user.id;
    otherUserId = otherSignup.body.user.id;
    accountCookie = accountSignup.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await pool.query('DELETE FROM "user" WHERE id IN ($1, $2)', [accountUserId, otherUserId]);
    await pool.end();
  });

  it('updates only the authenticated user and refreshes the session profile', async () => {
    await request(app)
      .post('/api/auth/update-user')
      .set('Cookie', accountCookie)
      .send({ name: '  Updated Account Name  ' })
      .expect(200);

    const session = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', accountCookie)
      .expect(200);
    expect(session.body.user).toMatchObject({
      id: accountUserId,
      name: 'Updated Account Name',
      email: accountEmail,
    });

    const users = await pool.query('SELECT id, name, email FROM "user" WHERE id IN ($1, $2)', [
      accountUserId,
      otherUserId,
    ]);
    expect(users.rows.find((user) => user.id === accountUserId)).toMatchObject({
      name: 'Updated Account Name',
      email: accountEmail,
    });
    expect(users.rows.find((user) => user.id === otherUserId)).toMatchObject({
      name: 'Other Account Name',
      email: otherEmail,
    });
  });

  it('rejects invalid names and email changes', async () => {
    await request(app)
      .post('/api/auth/update-user')
      .set('Cookie', accountCookie)
      .send({ name: '   ' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_ACCOUNT_NAME'));

    await request(app)
      .post('/api/auth/update-user')
      .set('Cookie', accountCookie)
      .send({ email: 'changed@example.test' })
      .expect(400);

    const user = await pool.query('SELECT name, email FROM "user" WHERE id = $1', [accountUserId]);
    expect(user.rows[0]).toMatchObject({ name: 'Updated Account Name', email: accountEmail });
  });
});
