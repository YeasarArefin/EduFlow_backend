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
import { PasswordResetEmail } from './emails/password-reset-email';
import { sendBrevoEmail } from './services/brevo-email.service';
import { accountNameSchema } from './validation/account.validation';

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
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const props = { recipientName: user.name, resetUrl: url };
      const htmlContent = await render(createElement(PasswordResetEmail, props));
      const textContent = await render(createElement(PasswordResetEmail, props), {
        plainText: true,
      });
      await sendBrevoEmail({
        to: { email: user.email, name: user.name },
        subject: 'Reset your EduFlow password',
        htmlContent,
        textContent,
      });
    },
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
      '/request-password-reset': { window: 15 * 60, max: 20 },
      '/change-password': { window: 15 * 60, max: 5 },
    },
  },
  advanced: {
    // Browser requests are proxied through the Vercel origin. Production cookies must never be
    // sent over HTTP; the default SameSite=Lax keeps them first-party at that origin.
    useSecureCookies: env.NODE_ENV === 'production',
  },
  databaseHooks: {
    user: {
      update: {
        before: (updatedUser) => {
          if (updatedUser.name === undefined) return Promise.resolve();

          const name = accountNameSchema.safeParse(updatedUser.name);
          if (!name.success) {
            throw new APIError('BAD_REQUEST', {
              code: 'INVALID_ACCOUNT_NAME',
              message: name.error.issues[0]?.message ?? 'Enter a valid name.',
            });
          }

          return Promise.resolve({ data: { ...updatedUser, name: name.data } });
        },
      },
    },
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
  trustedOrigins: env.corsAllowedOrigins,
});
