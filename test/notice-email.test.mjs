import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_SENDER_EMAIL = 'notices@example.com';
process.env.BREVO_SENDER_NAME = 'EduFlow Test';

const require = createRequire(import.meta.url);
const { render } = require('@react-email/render');
const { createElement } = require('react');
const { NoticeEmail } = require('../dist/backend/src/emails/notice-email.js');
const { BrevoEmailError, sendBrevoEmail } = require('../dist/backend/src/services/brevo-email.service.js');
const { createNotice, processNextNoticeBatch, queueNoticeRecipients, retryFailedNoticeRecipients } = require('../dist/backend/src/services/notice.service.js');
const { env } = require('../dist/backend/src/config/env.js');
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const workspaceId = randomUUID();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

beforeAll(async () => {
  await pool.query("INSERT INTO workspaces (id,name,slug,status) VALUES ($1,$2,$3,'active')", [workspaceId, 'North Star Coaching', `notice-email-${suffix}`]);
  await pool.query("INSERT INTO teachers (workspace_id,teacher_code,name,email) VALUES ($1,'NOTICE-EMAIL-1','Ayesha Teacher','teacher@example.com'),($1,'NOTICE-EMAIL-2','Invalid Teacher','invalid-email')", [workspaceId]);
  await pool.query("INSERT INTO students (workspace_id,student_code,full_name,email) VALUES ($1,'NOTICE-STUDENT-1','Student One','student@example.com')", [workspaceId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM notices WHERE workspace_id = $1', [workspaceId]);
  await pool.query('DELETE FROM students WHERE workspace_id = $1', [workspaceId]);
  await pool.query('DELETE FROM teachers WHERE workspace_id = $1', [workspaceId]);
  await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  await pool.end();
});

afterEach(() => vi.unstubAllGlobals());

describe('notice email delivery', () => {
  it('renders the workspace, recipient, title, and body', async () => {
    const html = await render(createElement(NoticeEmail, {
      workspaceName: 'North Star Coaching',
      noticeTitle: 'Holiday schedule',
      noticeBody: 'Classes resume on Sunday.',
      recipientName: 'Ayesha',
    }));

    expect(html).toContain('North Star Coaching');
    expect(html).toContain('Holiday schedule');
    expect(html).toContain('Hello Ayesha');
    expect(html).toContain('Classes resume on Sunday.');
    expect(html).toContain('EduFlow notice');
    expect(html).toContain('You received this notice from');
    expect(html).toContain('through EduFlow.');
  });

  it('sends a rendered email through Brevo and returns the provider id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'brevo-123' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendBrevoEmail({
      to: { email: 'teacher@example.com', name: 'Teacher One' },
      subject: 'Notice',
      htmlContent: '<p>Notice</p>',
      textContent: 'Notice',
    })).resolves.toEqual({ messageId: 'brevo-123' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({
      sender: { email: 'notices@example.com', name: 'EduFlow Test' },
      to: [{ email: 'teacher@example.com', name: 'Teacher One' }],
      subject: 'Notice',
    });
  });

  it('labels rate-limit responses as transient and validation responses as permanent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 })));
    await expect(sendBrevoEmail({ to: { email: 'teacher@example.com' }, subject: 'Notice', htmlContent: '<p>Notice</p>', textContent: 'Notice' })).rejects.toMatchObject({ name: BrevoEmailError.name, transient: true });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Invalid sender' }), { status: 400 })));
    await expect(sendBrevoEmail({ to: { email: 'teacher@example.com' }, subject: 'Notice', htmlContent: '<p>Notice</p>', textContent: 'Notice' })).rejects.toMatchObject({ name: BrevoEmailError.name, transient: false });
  });

  it('persists sent, skipped, and capped transient-failure delivery states without duplicate sends', async () => {
    const successfulNotice = await createNotice(workspaceId, 'notice-test-user', { audience: 'all_teachers', subject: 'Schedule', body: 'Classes resume Sunday.' });
    await queueNoticeRecipients(workspaceId, successfulNotice.id);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'provider-message-1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(processNextNoticeBatch(workspaceId, successfulNotice.id, { limit: 25 })).resolves.toMatchObject({ claimedCount: 1, sentCount: 1, skippedCount: 0 });
    const sent = await pool.query('SELECT status, provider_message_id FROM notice_recipients WHERE notice_id = $1 AND recipient_email = $2', [successfulNotice.id, 'teacher@example.com']);
    expect(sent.rows[0]).toEqual({ status: 'sent', provider_message_id: 'provider-message-1' });
    const invalid = await pool.query('SELECT status FROM notice_recipients WHERE notice_id = $1 AND recipient_email = $2', [successfulNotice.id, 'invalid-email']);
    expect(invalid.rows[0].status).toBe('skipped');

    await queueNoticeRecipients(workspaceId, successfulNotice.id);
    await expect(processNextNoticeBatch(workspaceId, successfulNotice.id, { limit: 25 })).resolves.toMatchObject({ claimedCount: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();

    const failedNotice = await createNotice(workspaceId, 'notice-test-user', { audience: 'all_teachers', subject: 'Temporary outage', body: 'Please retry.' });
    await queueNoticeRecipients(workspaceId, failedNotice.id);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 503 })));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(processNextNoticeBatch(workspaceId, failedNotice.id, { limit: 25 })).resolves.toMatchObject({ claimedCount: 1, failedCount: 1 });
      await retryFailedNoticeRecipients(workspaceId, failedNotice.id);
    }
    const failed = await pool.query('SELECT status, retry_count, last_error FROM notice_recipients WHERE notice_id = $1 AND recipient_email = $2', [failedNotice.id, 'teacher@example.com']);
    expect(failed.rows[0]).toMatchObject({ status: 'failed', retry_count: 3 });
    expect(failed.rows[0].last_error).toContain('503');
    await expect(retryFailedNoticeRecipients(workspaceId, failedNotice.id)).resolves.toEqual({ retriedCount: 0 });
  });

  it('queues an active student with a valid email address', async () => {
    const notice = await createNotice(workspaceId, 'notice-test-user', { audience: 'all_students', subject: 'Student update', body: 'Please check your schedule.' });
    await queueNoticeRecipients(workspaceId, notice.id);

    const recipient = await pool.query('SELECT status, recipient_email FROM notice_recipients WHERE notice_id = $1 AND recipient_kind = $2', [notice.id, 'student']);
    expect(recipient.rows).toEqual([{ status: 'queued', recipient_email: 'student@example.com' }]);
  });

  it('refreshes only recipients skipped for a missing email when an email is added later', async () => {
    const student = await pool.query("INSERT INTO students (workspace_id,student_code,full_name) VALUES ($1,'NOTICE-STUDENT-2','Student Two') RETURNING id", [workspaceId]);
    const notice = await createNotice(workspaceId, 'notice-test-user', { audience: 'all_students', subject: 'Email recovery', body: 'This recipient was updated.' });
    await queueNoticeRecipients(workspaceId, notice.id);
    await expect(pool.query('SELECT status FROM notice_recipients WHERE notice_id = $1 AND recipient_id = $2', [notice.id, student.rows[0].id])).resolves.toMatchObject({ rows: [{ status: 'skipped' }] });

    await pool.query('UPDATE students SET email = $1 WHERE id = $2', ['student-two@example.com', student.rows[0].id]);
    await queueNoticeRecipients(workspaceId, notice.id);
    await expect(pool.query('SELECT status, recipient_email FROM notice_recipients WHERE notice_id = $1 AND recipient_id = $2', [notice.id, student.rows[0].id])).resolves.toMatchObject({ rows: [{ status: 'queued', recipient_email: 'student-two@example.com' }] });
  });
});
