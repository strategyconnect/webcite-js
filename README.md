# Webcite TypeScript SDK and CLI

Webcite is an API for document parsing and claim verification. It reads PDFs, scans,
spreadsheets and office files into Markdown with per-page provenance, checks claims against
web sources or your own documents, and returns citations bound to the quotes that support or
contradict them. On ParseBench 2, Webcite extraction scored 91.74 overall (ranking pending
approval by LlamaIndex). This package is the official TypeScript client and command line tool
for the [Webcite API](https://webcite.co/api-docs).

```bash
npm install webcite
```

Node 18 or newer, Deno, Bun, browsers and edge runtimes (it uses the global `fetch`). ESM and
CommonJS builds with type declarations. One runtime dependency, `undici`, loaded only under
Node to allow requests longer than Node's default 300-second limit.

## First call

```ts
import { Webcite } from 'webcite';

const client = new Webcite(); // reads WEBCITE_API_KEY
const result = await client.verify('The Great Wall of China is visible from the Moon with the naked eye.');
const group = result.claim_groups?.[0];
console.log(group?.verdict?.result, result.usage?.credits);
for (const citation of group?.citations?.slice(0, 1) ?? []) {
  console.log(citation.stance, citation.url);
}
```

Recorded output (from the saved response at
[webcite.co/samples/claim-great-wall.json](https://webcite.co/samples/claim-great-wall.json),
recorded from the API on 24 November 2026):

```text
contradicted 4
contradicts https://www.nasa.gov/image-article/great-wall/
```

A verification costs 4 credits with the default stance and verdict. The Free plan includes
100 credits.

## Parse a document

```ts
import { readFile } from 'node:fs/promises';
import { Webcite } from 'webcite';

const client = new Webcite();
const bytes = new Uint8Array(await readFile('irs-form-w9-page-1.pdf'));
const { data } = await client.upload(bytes, { filename: 'irs-form-w9-page-1.pdf' });
const doc = await client.extract({ asset_id: data.asset_id });
console.log(doc.state, doc.usage?.credits);
console.log(doc.markdown?.split('\n')[0]);
```

Recorded output (saved response at
[webcite.co/samples/doc-irs-w9.json](https://webcite.co/samples/doc-irs-w9.json)):

```text
complete 0.4966
Form **W-9**
```

Uploading is free. Extraction is charged per page at cost. Check `state` before using
`markdown`: `complete: false` and `lost` name parts that were not recovered. The request stays
open until every page is read; there is no job to poll. `extractPages()` returns anchored
chunks for indexing and `extractFigures()` returns every recognised number with its source.

## Check quotes against sources

```ts
const sec = 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm';
const results = await client.verifyBatch([
  { id: 'q1', quote: 'Total net sales 391,035', url: sec },
  { id: 'q2', quote: 'Revenue was $12 million.', asset_id: data.asset_id, page: 1 },
]);
```

## Search sources and preview evidence

```ts
const found = await client.search('Apple total net sales fiscal 2024', { limit: 5 });
const preview = await client.sourcePreview({ url: found.citations?.[0]?.url, quote: 'Total net sales' });
```

## Stream a verification

```ts
for await (const event of client.verifyStream('The Eiffel Tower is 330 meters tall')) {
  console.log((event.data as { type?: string }).type);
}
```

The iterator throws `IncompleteStreamError` (with the events received so far) if the stream
ends without a `result` and a later `done` event, or reports `error`.

## Ask a question over a document

```ts
const job = await client.ask('What was revenue in FY2025?', doc.markdown ?? '');
const answer = await client.waitForAsk(job.id); // polls GET /api/v1/ask/{id}
```

`waitForAsk` stops on `done` or `failed`. After `maxWaitMs` (10 minutes by default) it resolves
with the latest job view instead of throwing, so you can keep polling.

## Credits

```ts
console.log((await client.balance()).credits?.remaining); // free
```

## Command line

```bash
npx webcite login                      # opens the API keys page and stores a pasted key
npx webcite verify "The Eiffel Tower is 330 meters tall"
npx webcite extract report.pdf > report.md
npx webcite search "Apple total net sales fiscal 2024" --limit 5
npx webcite balance
```

Every command accepts `--json` for the full API response and `--api-url` for a self-hosted
deployment. `extract` prints Markdown to stdout and the state and charge to stderr. Exit codes:
0 success, 1 API error, 2 usage error or missing key.

`webcite login` does not use a browser sign-in flow: the Webcite authorization server does not
offer device authorization. It opens https://webcite.co/api-keys, asks for the key with hidden
input, checks it with a free balance call and saves it to `~/.config/webcite/credentials.json`
(mode 600; `%APPDATA%\webcite` on Windows; `WEBCITE_CONFIG_DIR` overrides). In a
non-interactive shell it reads the key from stdin: `webcite login < key.txt`. `WEBCITE_API_KEY`
takes precedence over the stored key.

## Authentication

Create a key on the [API Keys page](https://webcite.co/api-keys) (sign-in required) and set it
as `WEBCITE_API_KEY`, or pass `new Webcite({ apiKey })`. The key is sent in the `x-api-key`
header. Keep it on your server; never put it in frontend code, a public repository or a chat
with an AI agent.

## Self-hosted deployments

Set `WEBCITE_API_URL` or pass `baseUrl`:

```ts
const client = new Webcite({ baseUrl: 'https://webcite.internal.example.com' });
```

The default is `https://api.webcite.co`. A key works only against the environment that issued it.

## Errors

Every error is a `WebciteError` with `status`, `code`, `message` (the server's text followed by
the next step), `nextStep`, `docUrl` and `retryAfter`.

| Error | When |
| --- | --- |
| `AuthenticationError` | 401, or no key. `nextStep` points to the API keys page. |
| `PermissionDeniedError` | 403. App keys cannot upload or extract. |
| `NotFoundError` | 404. The ID does not belong to this account. |
| `ConflictError` | 409. An Idempotency-Key was reused with a different payload. |
| `InsufficientCreditsError` | The balance is below the cost. Nothing was charged. |
| `RateLimitError` | 429. `retryAfter` is in seconds. |
| `ServerError` | 5xx. |
| `WebciteTimeoutError`, `WebciteConnectionError` | The request did not complete. |
| `IncompleteStreamError` | A stream ended without a result and `done`. |

```ts
import { InsufficientCreditsError } from 'webcite';

try {
  await client.verify('...');
} catch (error) {
  if (error instanceof InsufficientCreditsError) console.error(error.nextStep);
}
```

## Retries and timeouts

GET requests and `verify()` are retried up to twice on 429 and 5xx, with backoff that honours
`Retry-After`. `verify()` sends an `Idempotency-Key`, so a retry is not charged twice. Other
paid calls (extraction, batch, upload) are never repeated automatically; a timeout does not
prove the server did no work. The default timeout is 15 minutes, matching the extraction docs;
pass `timeout` (milliseconds) and `maxRetries` to change them, or `fetch` to supply your own.

The SDK sends no telemetry. Each request carries `x-webcite-surface: sdk-js` and a
`webcite-js/<version>` user agent, which Webcite stores as labels only.

## Links

- API documentation: https://webcite.co/api-docs (each page has a Markdown copy)
- OpenAPI: https://api.webcite.co/api/v1/openapi.json
- Errors and rate limits: https://webcite.co/api-docs/errors
- MCP server for AI agents: https://webcite.co/api-docs/mcp
- Python SDK: https://github.com/strategyconnect/webcite-python

## Development

```bash
npm install
npm run check   # biome, tsc, build, node:test; no network calls
```

MIT licensed.
