import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { db } from './database/client';
import * as authSchema from './database/schema/auth';
import { env } from './config/env';
import { APIError } from '@better-auth/core/error';
import { getActiveSessions, getSessionLimit } from './services/session-management.service';
import { render } from '@react-email/render';
import { createElement } from 'react';
import { EmailVerificationEmail } from './emails/email-verification-email';
import { sendBrevoEmail } from './services/brevo-email.service';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      const props = { recipientName: user.name, verificationUrl: url };
      const htmlContent = await render(createElement(EmailVerificationEmail, props));
      const textContent = await render(createElement(EmailVerificationEmail, props), {
        plainText: true,
      });
      await sendBrevoEmail({
        to: { email: user.email, name: user.name },
        subject: 'Verify your EduFlow email address',
        htmlContent,
        textContent,
      });
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      '/sign-up/email': { window: 60 * 60, max: 8 },
      '/sign-in/email': { window: 15 * 60, max: 10 },
      '/send-verification-email': { window: 60 * 60, max: 8 },
      '/verify-email': { window: 15 * 60, max: 20 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (newSession) => {
          const [limit, activeSessions] = await Promise.all([
            getSessionLimit(newSession.userId),
            getActiveSessions(newSession.userId),
          ]);

          if (activeSessions.length >= limit) {
            throw new APIError('FORBIDDEN', {
              code: 'SESSION_LIMIT_REACHED',
              message: 'This account has reached its active session limit.',
              activeSessions,
              sessionLimit: limit,
            });
          }
        },
      },
    },
  },
  trustedOrigins: [env.FRONTEND_ORIGIN],
});
