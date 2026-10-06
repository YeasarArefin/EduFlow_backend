import request from 'supertest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/src/app.js');
const { env } = require('../dist/src/config/env.js');
const {
  consumeReservedSmsCredits,
  creditPurchasedSmsCredits,
  refundReservedSmsCredits,
  reserveSmsCredits,
} = require('../dist/src/services/sms-wallet.service.js');
const { AppError } = require('../dist/src/middleware/error-handler.js');
const { Pool } = pg;
const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = createApp();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const membershipId = randomUUID();
const email = `sms-wallet-${suffix}@example.test`;

describe('SMS wallet API and ledger', () => {
  let cookie;
  let userId;

  beforeAll(async () => {
    const signUp = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ name: 'SMS Wallet Owner', email, password: 'safe-test-password' })
      .expect(200);
    userId = signUp.body.user.id;
    await pool.query('UPDATE "user" SET email_verified = true WHERE id = $1', [userId]);
    await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', signUp.headers['set-cookie']?.[0])
      .expect(200);
    const signIn = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: 'safe-test-password' })
      .expect(200);
    cookie = signIn.headers['set-cookie']?.[0];
    await pool.query('INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)', [
      workspaceId,
      'SMS Wallet Workspace',
      `sms-wallet-${suffix}`,
      otherWorkspaceId,
      'SMS Wallet Other Workspace',
      `sms-wallet-other-${suffix}`,
    ]);
    await pool.query(
      'INSERT INTO workspace_members (id, workspace_id, user_id, role_code) VALUES ($1, $2, $3, 101)',
      [membershipId, workspaceId, userId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM audit_logs WHERE workspace_id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query("SELECT set_config('app.sms_wallet_ledger_maintenance', 'on', false)");
    await pool.query('DELETE FROM sms_credit_ledger WHERE workspace_id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query('DELETE FROM sms_wallets WHERE workspace_id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query('DELETE FROM workspace_members WHERE id = $1', [membershipId]);
    await pool.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [
      workspaceId,
      otherWorkspaceId,
    ]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
    await pool.end();
  });

  const walletEndpoint = () =>
    request(app).get('/api/v1/sms-wallet').set('Cookie', cookie).set('X-Workspace-Id', workspaceId);

  it('records credit, reservation, usage, and refund as immutable ledger entries', async () => {
    await creditPurchasedSmsCredits(workspaceId, {
      amount: 500n,
      actorUserId: userId,
      referenceType: 'test_purchase',
      referenceId: randomUUID(),
    });
    await reserveSmsCredits(workspaceId, { amount: 125n, actorUserId: userId });
    await consumeReservedSmsCredits(workspaceId, { amount: 100n, actorUserId: userId });
    await refundReservedSmsCredits(workspaceId, { amount: 25n, actorUserId: userId });

    const response = await walletEndpoint().expect(200);
    expect(response.body.data).toMatchObject({
      availableCredits: '400',
      reservedCredits: '0',
      purchasedCredits: '500',
      usedCredits: '100',
      refundedCredits: '25',
    });

    const history = await request(app)
      .get('/api/v1/sms-wallet/history?page=1&limit=10')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(history.body.meta.total).toBe(4);
    expect(history.body.data.map((entry) => entry.transactionType).sort()).toEqual([
      'purchase',
      'refund',
      'reservation',
      'usage',
    ]);

    const ledgerId = history.body.data[0].id;
    await expect(
      pool.query('UPDATE sms_credit_ledger SET reason = $1 WHERE id = $2', ['changed', ledgerId])
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      pool.query('DELETE FROM sms_credit_ledger WHERE id = $1', [ledgerId])
    ).rejects.toMatchObject({
      code: 'P0001',
    });
  });

  it('blocks insufficient available or reserved credit changes', async () => {
    await expect(reserveSmsCredits(workspaceId, { amount: 401n })).rejects.toBeInstanceOf(AppError);
    await expect(consumeReservedSmsCredits(workspaceId, { amount: 1n })).rejects.toBeInstanceOf(
      AppError
    );
  });

  it('keeps concurrent reservations from overspending the available balance', async () => {
    const results = await Promise.allSettled([
      reserveSmsCredits(workspaceId, { amount: 300n }),
      reserveSmsCredits(workspaceId, { amount: 300n }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const wallet = await walletEndpoint().expect(200);
    expect(wallet.body.data).toMatchObject({ availableCredits: '100', reservedCredits: '300' });
  });

  it('enforces RLS isolation for wallet and ledger data', async () => {
    const client = await pool.connect();
    try {
      await client.query('SET ROLE eduflow_app');
      await client.query("SELECT set_config('app.workspace_id', $1, false)", [workspaceId]);
      const wallets = await client.query('SELECT workspace_id FROM sms_wallets');
      const ledger = await client.query('SELECT workspace_id FROM sms_credit_ledger');
      expect(wallets.rows).toEqual([{ workspace_id: workspaceId }]);
      expect(ledger.rows.every((row) => row.workspace_id === workspaceId)).toBe(true);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });

  it('denies unauthenticated and non-owner access', async () => {
    await request(app).get('/api/v1/sms-wallet').set('X-Workspace-Id', workspaceId).expect(401);
    await request(app)
      .get('/api/v1/sms-wallet')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', otherWorkspaceId)
      .expect(403);
  });
});
