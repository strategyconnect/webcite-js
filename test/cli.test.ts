import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readStoredKey, storeKey } from '../src/cli/credentials.js';
import { formatBalance, formatExtractSummary, formatVerify } from '../src/cli/format.js';
import { main } from '../src/cli/main.js';
import type { Balance, ExtractResponse, VerifyResponse } from '../src/index.js';
import { load } from './helpers.js';

test('verify output shows the claim, verdict, sources and credits', () => {
  const text = formatVerify(load('claim-great-wall.json') as VerifyResponse);
  assert.match(text, /^Claim: The Great Wall of China/m);
  assert.match(text, /^Verdict: contradicted$/m);
  assert.match(text, /\[contradicts\] nasa\.gov https:\/\/www\.nasa\.gov\/image-article\/great-wall\//);
  assert.match(text, /^Credits used: 4$/m);
});

test('extract summary and balance output', () => {
  assert.match(
    formatExtractSummary(load('doc-bls-table.json') as ExtractResponse),
    /State: complete\nUnits: 1\nCredits used: 0.3981/,
  );
  assert.equal(formatBalance(load('balance.json') as Balance), 'Remaining: 87.5\nUsed: 12.5\nTotal: 100');
});

test('login stores the key in a file only the user can read', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'webcite-')), 'webcite', 'credentials.json');
  await storeKey('k-123', path);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(await readStoredKey(path), 'k-123');
});

test('a command without a key exits 2 and names webcite login', async () => {
  const saved = { key: process.env.WEBCITE_API_KEY, dir: process.env.WEBCITE_CONFIG_DIR };
  delete process.env.WEBCITE_API_KEY;
  process.env.WEBCITE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'webcite-'));
  const writes: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((s: string) => writes.push(s) > 0) as typeof process.stderr.write;
  try {
    assert.equal(await main(['balance']), 2);
  } finally {
    process.stderr.write = original;
    process.env.WEBCITE_CONFIG_DIR = saved.dir;
    if (saved.dir === undefined) delete process.env.WEBCITE_CONFIG_DIR;
  }
  assert.match(writes.join(''), /webcite login.*https:\/\/webcite\.co\/api-keys/);
});
