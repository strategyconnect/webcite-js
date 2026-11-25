import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncompleteStreamError, type StreamEvent } from '../src/index.js';
import { bodyOf, json, load, recorder, sse } from './helpers.js';

const collect = async (it: AsyncIterable<StreamEvent>, into: StreamEvent[] = []): Promise<StreamEvent[]> => {
  for await (const e of it) into.push(e);
  return into;
};

test('stream yields events and completes', async () => {
  const result = load('claim-great-wall.json');
  const { client, sent } = recorder([
    sse({ type: 'progress' }, { type: 'result', data: result }, { type: 'usage', credits: 4 }, { type: 'done' }),
  ]);
  const events = await collect(client.verifyStream('claim'));
  assert.deepEqual(
    events.map((e) => (e.data as { type: string }).type),
    ['progress', 'result', 'usage', 'done'],
  );
  assert.equal(sent[0]?.url.pathname, '/api/v1/verify/stream');
  assert.equal(sent[0]?.headers.get('accept'), 'text/event-stream');
});

test('a stream without done throws with the partial events', async () => {
  const { client } = recorder([sse({ type: 'progress' }, { type: 'result', data: {} })]);
  const seen: StreamEvent[] = [];
  await assert.rejects(
    collect(client.verifyStream('claim'), seen),
    (e: unknown) => e instanceof IncompleteStreamError && e.events.length === 2,
  );
  assert.equal(seen.length, 2);
});

test('an error event throws', async () => {
  const { client } = recorder([sse({ type: 'error', message: 'Insufficient credits' })]);
  await assert.rejects(collect(client.verifyStream('claim')), /Insufficient credits/);
});

test('waitForAsk polls until done', async () => {
  const { client, sent } = recorder([
    json(202, { id: 'j1', status: 'queued' }),
    json(200, { id: 'j1', status: 'running' }),
    json(200, { id: 'j1', status: 'done', result: { answer: '12' } }),
  ]);
  const job = await client.ask('What was revenue?', 'Revenue was $12 million.');
  assert.deepEqual(bodyOf(sent[0]), { question: 'What was revenue?', documentText: 'Revenue was $12 million.' });
  const final = await client.waitForAsk(job.id, { pollIntervalMs: 0 });
  assert.equal(final.status, 'done');
  assert.deepEqual(
    sent.slice(1).map((r) => r.url.pathname),
    ['/api/v1/ask/j1', '/api/v1/ask/j1'],
  );
});

test('waitForAsk resolves with the latest view after maxWaitMs', async () => {
  const { client } = recorder([], () => json(200, { id: 'j1', status: 'running' }));
  assert.equal((await client.waitForAsk('j1', { pollIntervalMs: 0, maxWaitMs: 0 })).status, 'running');
});
