/** Typed errors. Each carries the server's message and the next step to take. */

export const ERRORS_DOC = 'https://webcite.co/api-docs/errors';
export const AUTH_DOC = 'https://webcite.co/api-docs/authentication';
export const CREDITS_DOC = 'https://webcite.co/api-docs/credits';
export const KEYS_PAGE = 'https://webcite.co/api-keys';

const CREDITS_RE = /insufficient credits|credit.balance.exhausted|credit limit exceeded|INSUFFICIENT_CREDITS/i;

export interface WebciteErrorOptions {
  readonly status?: number;
  readonly code?: string;
  readonly docUrl?: string;
  readonly retryAfter?: number;
  readonly nextStep?: string;
  readonly body?: unknown;
  readonly cause?: unknown;
}

export class WebciteError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly docUrl?: string;
  readonly retryAfter?: number;
  readonly nextStep?: string;
  readonly body?: unknown;

  constructor(message: string, options: WebciteErrorOptions = {}) {
    super(options.nextStep ? `${message} Next step: ${options.nextStep}` : message, {
      cause: options.cause,
    });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.docUrl = options.docUrl;
    this.retryAfter = options.retryAfter;
    this.nextStep = options.nextStep;
    this.body = options.body;
  }
}

export class APIError extends WebciteError {}
export class BadRequestError extends APIError {}
export class AuthenticationError extends APIError {}
export class PermissionDeniedError extends APIError {}
export class NotFoundError extends APIError {}
export class ConflictError extends APIError {}
export class PayloadTooLargeError extends APIError {}
export class RateLimitError extends APIError {}
export class InsufficientCreditsError extends APIError {}
export class ServerError extends APIError {}
/** The request did not reach the API or the connection dropped. */
export class WebciteConnectionError extends WebciteError {}
/** The client timeout passed before the API answered. */
export class WebciteTimeoutError extends WebciteConnectionError {}

/** A verification stream ended without a result and a done event. */
export class IncompleteStreamError extends WebciteError {
  readonly events: readonly unknown[];
  constructor(message: string, events: readonly unknown[], options: WebciteErrorOptions = {}) {
    super(message, options);
    this.events = events;
  }
}

export const MISSING_KEY_STEP = `Create a key at ${KEYS_PAGE} (sign-in required).`;

type ErrorClass = new (message: string, options: WebciteErrorOptions) => APIError;

const STEPS: Readonly<Record<number, readonly [ErrorClass, string, string, string]>> = {
  401: [
    AuthenticationError,
    'unauthorized',
    AUTH_DOC,
    `Check the API key. Create one at ${KEYS_PAGE} (sign-in required). A key works only against the environment that issued it.`,
  ],
  403: [
    PermissionDeniedError,
    'forbidden',
    AUTH_DOC,
    `This key may not use this resource (app keys cannot upload or extract). Use an account API key from ${KEYS_PAGE}.`,
  ],
  404: [NotFoundError, 'not_found', ERRORS_DOC, 'Confirm the ID exists and belongs to the account that owns this key.'],
  409: [
    ConflictError,
    'conflict',
    ERRORS_DOC,
    'The Idempotency-Key was used with a different payload. Resend the original payload, or use a new key for a new request.',
  ],
  413: [PayloadTooLargeError, 'payload_too_large', ERRORS_DOC, 'Reduce the input. Files can be at most 100 MB.'],
};

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function serverMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const msg = (body as { message?: unknown }).message;
    if (Array.isArray(msg)) return msg.map(String).join('; ');
    if (typeof msg === 'string' && msg) return msg;
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 500);
  return `HTTP ${status}`;
}

export function parseRetryAfter(headers: Headers, body: unknown): number | undefined {
  const raw =
    headers.get('retry-after') ??
    (body && typeof body === 'object' ? (body as { retryAfter?: unknown }).retryAfter : undefined);
  if (raw === undefined || raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : undefined;
}

export function errorFromResponse(status: number, headers: Headers, text: string): APIError {
  const body = parseBody(text);
  const message = serverMessage(body, status);
  const serverCode = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  const retryAfter = parseRetryAfter(headers, body);
  const base = { status, body, retryAfter };
  if ([400, 402, 429].includes(status) && CREDITS_RE.test(text)) {
    return new InsufficientCreditsError(message, {
      ...base,
      code: 'insufficient_credits',
      docUrl: CREDITS_DOC,
      nextStep:
        'Stop paid calls and keep completed results. Check the balance with balance(); an account owner can add credits or enable overage where the plan allows it.',
    });
  }
  const step = STEPS[status];
  if (step) {
    const [Cls, code, docUrl, nextStep] = step;
    return new Cls(message, { ...base, code, docUrl, nextStep });
  }
  if (status === 429) {
    const wait = retryAfter !== undefined ? `Wait ${retryAfter} seconds` : 'Wait';
    return new RateLimitError(message, {
      ...base,
      code: 'rate_limited',
      docUrl: ERRORS_DOC,
      nextStep: `${wait} and retry.`,
    });
  }
  if (status >= 500) {
    return new ServerError(message, {
      ...base,
      code: String(serverCode ?? 'server_error'),
      docUrl: ERRORS_DOC,
      nextStep:
        'Inspect saved operation IDs before repeating a paid call. A verify retry is safe with the same Idempotency-Key.',
    });
  }
  return new BadRequestError(message, {
    ...base,
    code: String(serverCode ?? 'bad_request'),
    docUrl: ERRORS_DOC,
    nextStep: 'Check the request fields against the endpoint reference.',
  });
}
