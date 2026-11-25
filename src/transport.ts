/** Configuration, retries, error mapping and server-sent events for the client. */

import {
  AuthenticationError,
  errorFromResponse,
  IncompleteStreamError,
  MISSING_KEY_STEP,
  WebciteConnectionError,
  WebciteError,
  WebciteTimeoutError,
} from './errors.js';
import type { FileInput, RequestSpec } from './requests.js';
import type { StreamEvent } from './types.js';
import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.webcite.co';
/** Extraction keeps the request open while every page is read; the docs use 15 minutes. */
export const DEFAULT_TIMEOUT_MS = 900_000;
export const DEFAULT_MAX_RETRIES = 2;
export const SURFACE = 'sdk-js';
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface ClientOptions {
  /** Defaults to the WEBCITE_API_KEY environment variable where `process.env` exists. */
  readonly apiKey?: string;
  /** Defaults to WEBCITE_API_URL, then https://api.webcite.co. Use it for self-hosted deployments. */
  readonly baseUrl?: string;
  /** Milliseconds before a request is abandoned. Default 900000 (15 minutes). */
  readonly timeout?: number;
  /** Retries for GET requests and keyed verifications on 429 and 5xx. Default 2. */
  readonly maxRetries?: number;
  /** A fetch implementation. Defaults to the global fetch. */
  readonly fetch?: typeof fetch;
}

export interface Config {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly fetch: typeof fetch;
}

const env = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];

export function resolveConfig(options: ClientOptions): Config {
  const apiKey = (options.apiKey ?? env('WEBCITE_API_KEY') ?? '').trim();
  if (!apiKey) {
    throw new AuthenticationError('No Webcite API key was provided.', {
      code: 'missing_api_key',
      docUrl: 'https://webcite.co/api-docs/authentication',
      nextStep: MISSING_KEY_STEP,
    });
  }
  const baseUrl = (options.baseUrl ?? env('WEBCITE_API_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new WebciteError('No fetch implementation is available.');
  return {
    apiKey,
    baseUrl,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    maxRetries: Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES),
    fetch: fetchImpl,
  };
}

/** Node's global fetch stops waiting for headers after 300 s; long extractions need longer. */
const dispatchers = new Map<number, Promise<unknown>>();
function nodeDispatcher(timeout: number): Promise<unknown> {
  const isNode =
    typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
  if (!isNode) return Promise.resolve(undefined);
  const existing = dispatchers.get(timeout);
  if (existing) return existing;
  const specifier = 'undici';
  const created = import(specifier).then(
    (m: { Agent: new (o: object) => unknown }) => new m.Agent({ headersTimeout: timeout, bodyTimeout: timeout }),
    () => undefined,
  );
  dispatchers.set(timeout, created);
  return created;
}

function headers(config: Config, spec: RequestSpec): Record<string, string> {
  return {
    'x-api-key': config.apiKey,
    'x-webcite-surface': SURFACE,
    'User-Agent': `webcite-js/${VERSION}`,
    Accept: spec.stream ? 'text/event-stream' : 'application/json',
    ...(spec.json ? { 'Content-Type': 'application/json' } : {}),
    ...(spec.idempotencyKey ? { 'Idempotency-Key': spec.idempotencyKey } : {}),
  };
}

function toBlob(data: FileInput): Blob {
  return data instanceof Blob ? data : new Blob([data as BlobPart]);
}

function body(spec: RequestSpec): BodyInit | undefined {
  if (spec.json) return JSON.stringify(spec.json);
  if (!spec.form) return undefined;
  const form = new FormData();
  form.append('file', toBlob(spec.form.file.data), spec.form.file.filename);
  for (const [k, v] of Object.entries(spec.form.fields ?? {})) form.append(k, v);
  return form;
}

function url(config: Config, spec: RequestSpec): string {
  const params = Object.entries(spec.query ?? {}).filter(([, v]) => v !== undefined);
  const qs = new URLSearchParams(params.map(([k, v]) => [k, String(v)])).toString();
  return `${config.baseUrl}${spec.path}${qs ? `?${qs}` : ''}`;
}

const retryable = (spec: RequestSpec): boolean => spec.method === 'GET' || spec.idempotencyKey !== undefined;

function delayMs(attempt: number, retryAfter: number | undefined): number {
  if (retryAfter !== undefined) return Math.min(retryAfter, 30) * 1000;
  return Math.min(500 * 2 ** attempt, 8000) * (0.75 + Math.random() / 2);
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt(config: Config, spec: RequestSpec): Promise<Response> {
  const dispatcher = await nodeDispatcher(config.timeout);
  const init: RequestInit & { dispatcher?: unknown } = {
    method: spec.method,
    headers: headers(config, spec),
    body: body(spec),
    signal: AbortSignal.timeout(config.timeout),
    ...(dispatcher ? { dispatcher } : {}),
  };
  try {
    return await config.fetch(url(config, spec), init);
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new WebciteTimeoutError(
        `${spec.method} ${spec.path} did not answer within the client timeout. The server may still have completed the work; keep any operation IDs and check before repeating a paid call. Raise { timeout } for long documents.`,
        { cause: error },
      );
    }
    throw new WebciteConnectionError(`Could not reach ${config.baseUrl}: ${String(error)}`, { cause: error });
  }
}

/** Sends a spec, retrying only safe requests on 429, 5xx and network failures. */
export async function send(config: Config, spec: RequestSpec): Promise<Response> {
  for (let n = 0; ; n += 1) {
    const canRetry = retryable(spec) && n < config.maxRetries;
    let response: Response;
    try {
      response = await attempt(config, spec);
    } catch (error) {
      if (!canRetry) throw error;
      await sleep(delayMs(n, undefined));
      continue;
    }
    if (response.ok) return response;
    const error = errorFromResponse(response.status, response.headers, await response.text());
    if (!canRetry || !RETRY_STATUSES.has(response.status)) throw error;
    await sleep(delayMs(n, error.retryAfter));
  }
}

export async function sendJson<T>(config: Config, spec: RequestSpec): Promise<T> {
  const response = await send(config, spec);
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw errorFromResponse(502, response.headers, 'API response did not contain valid JSON');
  }
}

function kindOf(event: StreamEvent): string {
  const data = event.data as { type?: unknown } | null;
  return event.event === 'message' && data && typeof data === 'object' ? String(data.type ?? 'message') : event.event;
}

function parseFrame(lines: readonly string[]): StreamEvent | undefined {
  let event = 'message';
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0) return undefined;
  const raw = data.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

async function* frames(response: Response): AsyncGenerator<StreamEvent> {
  if (!response.body) throw new IncompleteStreamError('The stream had no body.', []);
  const decoder = new TextDecoder();
  let buffer = '';
  let pending: string[] = [];
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      if (line !== '') {
        pending = [...pending, line];
        continue;
      }
      const frame = parseFrame(pending);
      pending = [];
      if (frame) yield frame;
    }
  }
}

/** Yields events. Throws IncompleteStreamError unless a result and a later done arrive. */
export async function* streamEvents(config: Config, spec: RequestSpec): AsyncGenerator<StreamEvent> {
  const response = await send(config, spec);
  let seen: readonly StreamEvent[] = [];
  let hasResult = false;
  let done = false;
  try {
    for await (const event of frames(response)) {
      seen = [...seen, event];
      yield event;
      const kind = kindOf(event);
      if (kind === 'error' || kind === 'accounting_error') {
        const detail = (event.data as { message?: unknown } | null)?.message;
        throw new IncompleteStreamError(
          `Verification stream reported ${kind}${detail ? `: ${String(detail)}` : ''}`,
          seen,
        );
      }
      if (kind === 'result' || kind === 'complete') hasResult = true;
      if (kind === 'done') {
        if (!hasResult) throw new IncompleteStreamError('Stream completion arrived before its result', seen);
        done = true;
      }
    }
  } catch (error) {
    if (error instanceof IncompleteStreamError) throw error;
    throw new IncompleteStreamError(`Verification stream disconnected: ${String(error)}`, seen, { cause: error });
  }
  if (!hasResult || !done) {
    throw new IncompleteStreamError('Verification stream ended without a result and a done event', seen);
  }
}
