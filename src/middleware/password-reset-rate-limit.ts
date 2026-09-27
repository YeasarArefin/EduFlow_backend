import { ipKeyGenerator } from 'express-rate-limit';
import rateLimit from 'express-rate-limit';

const requestWindowMs = 15 * 60 * 1000;
const maxResetRequests = 5;

function normalizedEmail(body: unknown) {
  if (!body || typeof body !== 'object' || !('email' in body)) return 'anonymous';
  const { email } = body;
  return typeof email === 'string' ? email.trim().toLowerCase() : 'anonymous';
}

export const passwordResetRateLimit = rateLimit({
  windowMs: requestWindowMs,
  limit: maxResetRequests,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (request) => `${ipKeyGenerator(request.ip ?? '')}:${normalizedEmail(request.body)}`,
  message: { message: 'Too many reset requests. Please try again later.' },
});
