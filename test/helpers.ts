import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Webcite } from '../src/index.js';

// Compiled tests run from .test-build/test, so fixtures resolve from the package root.
export const FIXTURES = join(process.cwd(), 'test', 'fixtures');

export const load = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

export interface Sent {
  readonly method: string;
  readonly url: URL;
  readonly headers: Headers;
  readonly body: BodyInit | null | undefined;
}

export type Reply = Response | ((req: Sent) => Response);

export const json = (status: number, data: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

export const sse = (...frames: unknown[]): Response =>
  new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

/** A fetch stand-in that records requests and answers from a queue, then from `fallback`. */
export function recorder(replies: Reply[] = [], fallback: Reply = () => json(200, {})) {
  const sent: Sent[] = [];
  const queue = [...replies];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req: Sent = {
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: init?.body,
    };
    sent.push(req);
    const reply = queue.shift() ?? fallback;
    return typeof reply === 'function' ? reply(req) : reply;
  }) as typeof fetch;
  const client = new Webcite({ apiKey: 'test-key', fetch: fetchImpl });
  return { client, sent, fetchImpl };
}

export const bodyOf = (req: Sent | undefined): unknown => JSON.parse(String(req?.body));
