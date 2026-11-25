/**
 * Every request the SDK can send must match a path and method in the public OpenAPI. The one
 * exception is the credit balance route: it accepts an API key and backs the MCP server's
 * get_credit_balance tool, but it is not in the OpenAPI document.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Webcite } from '../src/index.js';
import { json, load, recorder, sse } from './helpers.js';

const NOT_IN_OPENAPI = new Set(['GET /api/v1/payment/credits/balance']);

const operations = (): Array<[string, string]> => {
  const spec = load('openapi.json') as { paths: Record<string, Record<string, unknown>> };
  return Object.entries(spec.paths).flatMap(([p, ops]) =>
    Object.keys(ops).map((m): [string, string] => [m.toUpperCase(), p]),
  );
};

const templateRegex = (path: string): RegExp => new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}$`);

const everyCall = (c: Webcite): Array<() => unknown> => {
  const bytes = new Uint8Array([1]);
  return [
    () => c.verify('c'),
    async () => {
      for await (const _ of c.verifyStream('c'));
    },
    () => c.verifyBatch([{ quote: 'q', url: 'https://a.example' }]),
    () => c.verifyFeedback('t', 'correct'),
    () => c.verifyNumeric({ claim: '2+2=4' }),
    () => c.search('q'),
    () => c.listCitations({ page: 1 }),
    () => c.getCitation('id1'),
    () => c.sourcePreview({ url: 'https://a.example' }),
    () => c.upload(bytes, { filename: 'a.pdf' }),
    () => c.uploadUrl('https://a.example/a.pdf'),
    () => c.extract({ asset_id: 'a' }),
    () => c.extractVisualRendition({ asset_id: 'a' }),
    () => c.extractPages({ asset_id: 'a' }),
    () => c.extractFigures({ asset_id: 'a' }),
    () => c.classify({ asset_id: 'a' }),
    () => c.gaps('saas', [{ name: 'deck' }]),
    () => c.ask('q', 'text'),
    () => c.getAsk('j1'),
    () => c.analyzeConflicts([{ value: 1 }]),
    () => c.analyzeDocument('a'),
    () => c.accuracy(),
    () => c.balance(),
    () => c.registerSource('a', bytes, { filename: 'a.pdf' }),
    () => c.publishTextRepresentation('v1'),
    () => c.latestRepresentation('v1'),
    () => c.sourceUnit('v1', 'r1', 'u1'),
    () => c.prepareOcrRescue('v1', 'r1'),
  ];
};

async function sentOperations(): Promise<Array<[string, string]>> {
  const { client, sent } = recorder([], (req) =>
    req.url.pathname.endsWith('/stream')
      ? sse({ type: 'result', data: {} }, { type: 'done' })
      : json(200, { status: 'done' }),
  );
  for (const call of everyCall(client)) await call();
  return sent.map((r) => [r.method, r.url.pathname]);
}

test('every SDK request is in the public OpenAPI', async () => {
  const patterns = operations().map(([m, p]) => [m, templateRegex(p)] as const);
  for (const [method, path] of await sentOperations()) {
    if (NOT_IN_OPENAPI.has(`${method} ${path}`)) continue;
    assert.ok(
      patterns.some(([m, rx]) => m === method && rx.test(path)),
      `${method} ${path}`,
    );
  }
});

test('every public OpenAPI operation has an SDK method', async () => {
  const sent = await sentOperations();
  for (const [method, template] of operations()) {
    const rx = templateRegex(template);
    assert.ok(
      sent.some(([m, p]) => m === method && rx.test(p)),
      `${method} ${template}`,
    );
  }
});

test('the contract check detects an unknown path', () => {
  const patterns = operations().map(([m, p]) => [m, templateRegex(p)] as const);
  assert.ok(!patterns.some(([m, rx]) => m === 'POST' && rx.test('/api/v1/review')));
});
