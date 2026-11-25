import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExtractResponse, VerifyResponse } from '../src/index.js';
import { AuthenticationError, VERSION, Webcite } from '../src/index.js';
import { bodyOf, json, load, recorder } from './helpers.js';

const CLAIM = 'The Great Wall of China is visible from the Moon with the naked eye.';

test('verify sends the documented request and returns the saved response', async () => {
  const { client, sent } = recorder([json(201, load('claim-great-wall.json'))]);
  const result: VerifyResponse = await client.verify(CLAIM);
  const req = sent[0];
  assert.equal(req?.method, 'POST');
  assert.equal(req?.url.href, 'https://api.webcite.co/api/v1/verify');
  assert.equal(req?.headers.get('x-api-key'), 'test-key');
  assert.equal(req?.headers.get('x-webcite-surface'), 'sdk-js');
  assert.equal(req?.headers.get('user-agent'), `webcite-js/${VERSION}`);
  assert.ok(req?.headers.get('idempotency-key'));
  assert.deepEqual(bodyOf(req), { claim: CLAIM });
  const group = result.claim_groups?.[0];
  assert.equal(group?.verdict?.result, 'contradicted');
  assert.equal(group?.citations?.[0]?.url, 'https://www.nasa.gov/image-article/great-wall/');
  assert.equal(result.usage?.credits, 4);
});

test('verify passes options without inventing defaults', async () => {
  const { client, sent } = recorder();
  await client.verify('x', { include_stance: false, source_urls: ['https://a.example'] });
  assert.deepEqual(bodyOf(sent[0]), { claim: 'x', include_stance: false, source_urls: ['https://a.example'] });
});

test('extract returns the saved document', async () => {
  const { client, sent } = recorder([json(201, load('doc-bls-table.json'))]);
  const doc: ExtractResponse = await client.extract({ asset_id: 'asset-1', mode: 'standard' });
  assert.equal(sent[0]?.url.pathname, '/api/v1/extract');
  assert.deepEqual(bodyOf(sent[0]), { asset_id: 'asset-1', mode: 'standard' });
  assert.equal(doc.state, 'complete');
  assert.match(doc.markdown ?? '', /Summary table A/);
  assert.equal(doc.usage?.page_charges?.[0]?.page_type, 'form');
});

test('extract requires an asset', async () => {
  const { client } = recorder();
  assert.throws(() => client.extract({}), /asset_id/);
});

test('upload sends a multipart file with its name', async () => {
  const { client, sent } = recorder([json(200, { successCode: 200, data: { asset_id: 'a1' } })]);
  const out = await client.upload(new TextEncoder().encode('%PDF-1.4'), { filename: 'report.pdf' });
  const form = sent[0]?.body as FormData;
  const file = form.get('file') as File;
  assert.equal(file.name, 'report.pdf');
  assert.equal(await file.text(), '%PDF-1.4');
  assert.equal(sent[0]?.headers.get('content-type'), null);
  assert.equal(out.data.asset_id, 'a1');
});

test('upload of bytes without a filename is refused before sending', () => {
  const { client, sent } = recorder();
  assert.throws(() => client.upload(new Uint8Array([1])), /filename/);
  assert.equal(sent.length, 0);
});

test('search and balance', async () => {
  const { client, sent } = recorder([json(200, load('claim-apple-fy2024.json')), json(200, load('balance.json'))]);
  const found = await client.search('Apple FY2024 net sales', { limit: 3 });
  assert.deepEqual(bodyOf(sent[0]), { query: 'Apple FY2024 net sales', limit: 3 });
  assert.match(found.claim_groups?.[0]?.citations?.[0]?.url ?? '', /^https:\/\/www\.sec\.gov\//);
  assert.equal((await client.balance()).credits?.remaining, 87.5);
  assert.equal(sent[1]?.method, 'GET');
});

test('environment variables and a self-hosted base URL', async () => {
  process.env.WEBCITE_API_KEY = 'env-key';
  process.env.WEBCITE_API_URL = 'https://webcite.internal.example/';
  try {
    const { fetchImpl, sent } = recorder();
    await new Webcite({ fetch: fetchImpl }).accuracy();
    assert.equal(sent[0]?.url.href, 'https://webcite.internal.example/api/v1/accuracy');
    assert.equal(sent[0]?.headers.get('x-api-key'), 'env-key');
  } finally {
    delete process.env.WEBCITE_API_KEY;
    delete process.env.WEBCITE_API_URL;
  }
});

test('a missing key names the key page', () => {
  assert.throws(
    () => new Webcite({ fetch: (() => undefined) as unknown as typeof fetch }),
    (e: unknown) =>
      e instanceof AuthenticationError &&
      e.code === 'missing_api_key' &&
      e.message.includes('https://webcite.co/api-keys'),
  );
});

test('path identifiers are encoded', async () => {
  const { client, sent } = recorder();
  await client.getCitation('a/b c');
  assert.equal(sent[0]?.url.pathname, '/api/v1/citations/a%2Fb%20c');
});

test('list citations sends query parameters', async () => {
  const { client, sent } = recorder();
  await client.listCitations({ page: 2, limit: 5 });
  assert.equal(sent[0]?.url.search, '?page=2&limit=5');
});
