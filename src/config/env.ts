import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z
      .string()
      .url()
      .default('postgresql://postgres:eduflow_dev@localhost:5433/eduflow'),
    FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
    BETTER_AUTH_URL: z.string().url().default('http://localhost:4000'),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BREVO_API_KEY: z.string().min(1).optional(),
    BREVO_SENDER_EMAIL: z.string().email().optional(),
    BREVO_SENDER_NAME: z.string().min(1).max(150).default('EduFlow'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.BETTER_AUTH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        message: 'BETTER_AUTH_SECRET is required in production.',
        path: ['BETTER_AUTH_SECRET'],
      });
    }
    if (value.NODE_ENV === 'production' && !value.BREVO_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'BREVO_API_KEY is required in production.', path: ['BREVO_API_KEY'] });
    }
    if (value.NODE_ENV === 'production' && !value.BREVO_SENDER_EMAIL) {
      ctx.addIssue({ code: 'custom', message: 'BREVO_SENDER_EMAIL is required in production.', path: ['BREVO_SENDER_EMAIL'] });
    }
  })
  .transform((value) => ({
    ...value,
    BETTER_AUTH_SECRET: value.BETTER_AUTH_SECRET ?? 'development-only-better-auth-secret-change-me',
  }));

export const env = envSchema.parse(process.env);
