// Runs the README quickstarts against the saved responses, with no network access.
// Usage: node examples/quickstart-fixtures.mjs test/fixtures
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Webcite } from 'webcite';

const dir = process.argv[2] ?? 'test/fixtures';
const saved = (name) => readFileSync(join(dir, name), 'utf8');
const routes = {
  '/api/v1/verify': () => saved('claim-great-wall.json'),
  '/api/v1/upload': () => JSON.stringify({ successCode: 200, data: { asset_id: 'a1' } }),
  '/api/v1/extract': () => saved('doc-irs-w9.json'),
};
const fetchFixture = async (url) => new Response(routes[new URL(url).pathname](), { status: 201 });

const client = new Webcite({ apiKey: 'fixture-key', fetch: fetchFixture });
const result = await client.verify('The Great Wall of China is visible from the Moon with the naked eye.');
const group = result.claim_groups?.[0];
console.log(group?.verdict?.result, result.usage?.credits);
for (const citation of group?.citations?.slice(0, 1) ?? []) {
  console.log(citation.stance, citation.url);
}

const { data } = await client.upload(new Uint8Array([37, 80, 68, 70]), { filename: 'irs-form-w9-page-1.pdf' });
const doc = await client.extract({ asset_id: data.asset_id });
console.log(doc.state, doc.usage?.credits);
console.log(doc.markdown?.split('\n')[0]);
