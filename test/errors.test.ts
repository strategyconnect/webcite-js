import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AuthenticationError,
  InsufficientCreditsError,
  RateLimitError,
  ServerError,
  Webcite,
  WebciteTimeoutError,
} from '../src/index.js';
import { json, recorder } from './helpers.js';

const UNAUTH = {
  message: 'Authentication required. Please provide a valid Bearer token, API key, or bot key.',
  error: 'Unauthorized',
  statusCode: 401,
};

test('401 carries the server message and the key page', async () => {
  const { client, sent } = recorder([json(401, UNAUTH)]);
  await assert.rejects(client.listCitations(), (e: unknown) => {
    assert.ok(e instanceof AuthenticationError);
    assert.equal(e.status, 401);
    assert.ok(e.message.startsWith(UNAUTH.message));
    assert.match(e.nextStep ?? '', /https:\/\/webcite\.co\/api-keys/);
    assert.equal(e.docUrl, 'https://webcite.co/api-docs/authentication');
    return true;
  });
  assert.equal(sent.length, 1);
});

test('insufficient credits is typed', async () => {
  const msg = 'Insufficient credits. Required: 3, Available: 1';
  const { client } = recorder([json(400, { message: msg, statusCode: 400 })]);
  await assert.rejects(
    client.extract({ asset_id: 'a1' }),
    (e: unknown) => e instanceof InsufficientCreditsError && e.code === 'insufficient_credits',
  );
});

test('GET is retried on 503 then succeeds', async () => {
  const { client, sent } = recorder([json(503, { message: 'busy' }), json(200, { a: 1 })]);
  assert.deepEqual(await client.accuracy(), { a: 1 });
  assert.equal(sent.length, 2);
});

test('a verify retry reuses its Idempotency-Key', async () => {
  const { client, sent } = recorder([json(429, { message: 'slow down' }, { 'retry-after': '0' }), json(200, {})]);
  await client.verify('x');
  assert.equal(sent.length, 2);
  assert.equal(new Set(sent.map((r) => r.headers.get('idempotency-key'))).size, 1);
});

test('a paid POST without a key is never repeated', async () => {
  const { client, sent } = recorder([json(502, { message: 'storage failed' })]);
  await assert.rejects(
    client.extract({ asset_id: 'a1' }),
    (e: unknown) => e instanceof ServerError && e.message.startsWith('storage failed'),
  );
  assert.equal(sent.length, 1);
});

test('retries stop at the budget and report Retry-After', async () => {
  const { client, sent } = recorder([], () => json(429, { retryAfter: 0 }, { 'retry-after': '0' }));
  await assert.rejects(client.accuracy(), (e: unknown) => e instanceof RateLimitError && e.retryAfter === 0);
  assert.equal(sent.length, 3);
});

test('a client timeout on extract is not retried and explains', async () => {
  let calls = 0;
  const slow = (async () => {
    calls += 1;
    throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  }) as typeof fetch;
  const client = new Webcite({ apiKey: 'k', fetch: slow });
  await assert.rejects(
    client.extract({ asset_id: 'a1' }),
    (e: unknown) => e instanceof WebciteTimeoutError && /may still have completed/.test(e.message),
  );
  assert.equal(calls, 1);
});

test('the default timeout allows long extractions', async () => {
  let signal: AbortSignal | undefined;
  const capture = (async (_u: unknown, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return json(200, {});
  }) as typeof fetch;
  await new Webcite({ apiKey: 'k', fetch: capture }).accuracy();
  assert.ok(signal);
  const { DEFAULT_TIMEOUT_MS } = await import('../src/index.js');
  assert.equal(DEFAULT_TIMEOUT_MS, 900_000);
});
