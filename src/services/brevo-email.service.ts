import { env } from '../config/env';

export type BrevoEmailInput = {
  to: { email: string; name?: string | null };
  subject: string;
  htmlContent: string;
  textContent: string;
};

export type BrevoEmailResult = { messageId: string | null };

export class BrevoEmailError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean
  ) {
    super(message);
    this.name = 'BrevoEmailError';
  }
}

function responseMessage(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof payload.message === 'string'
  )
    return payload.message;
  return `Brevo email request failed with status ${status}.`;
}

export async function sendBrevoEmail(input: BrevoEmailInput): Promise<BrevoEmailResult> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    throw new BrevoEmailError('Brevo email delivery is not configured.', false);
  }

  let response: Response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
        to: [{ email: input.to.email, ...(input.to.name ? { name: input.to.name } : {}) }],
        subject: input.subject,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reach Brevo.';
    throw new BrevoEmailError(message, true);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new BrevoEmailError(
      responseMessage(payload, response.status),
      response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500
    );
  const messageId =
    payload &&
    typeof payload === 'object' &&
    'messageId' in payload &&
    typeof payload.messageId === 'string'
      ? payload.messageId
      : null;
  return { messageId };
}
