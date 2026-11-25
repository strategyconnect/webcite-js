/** The `webcite` command line. Every command accepts --json for the full API response. */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { Webcite } from '../client.js';
import { KEYS_PAGE, WebciteError } from '../errors.js';
import { VERSION } from '../version.js';
import { credentialsPath, readStoredKey } from './credentials.js';
import { formatBalance, formatExtractSummary, formatSearch, formatVerify } from './format.js';
import { readKey, storeKey } from './login.js';

const HELP = `webcite ${VERSION}: the Webcite API from the command line

Usage:
  webcite verify "<claim>" [--source-url <url>]...   Verify a claim against sources (4 credits)
  webcite extract <file> [--mode lite|standard]      Upload a file and print its Markdown
  webcite search "<query>" [--limit <n>]             Search for sources
  webcite balance                                    Show remaining credits (free)
  webcite login [--no-browser]                       Store an API key for this user

Options:
  --json             Print the full JSON response
  --api-url <url>    API origin for a self-hosted deployment (or WEBCITE_API_URL)
  -h, --help         Show this help
  -v, --version      Show the version

The API key comes from WEBCITE_API_KEY, else from the file written by \`webcite login\`.
Docs: https://webcite.co/api-docs`;

const OPTIONS = {
  json: { type: 'boolean' },
  'api-url': { type: 'string' },
  'source-url': { type: 'string', multiple: true },
  mode: { type: 'string' },
  limit: { type: 'string' },
  'no-browser': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>['values'];

class UsageError extends Error {}

const out = (text: string): void => {
  if (text) process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
};
const print = (values: Values, data: unknown, human: () => string): void =>
  out(values.json ? JSON.stringify(data, null, 2) : human());

async function client(values: Values): Promise<Webcite> {
  const apiKey = process.env.WEBCITE_API_KEY || (await readStoredKey());
  if (!apiKey) {
    throw new UsageError(
      `Run \`webcite login\`, or set WEBCITE_API_KEY. Create a key at ${KEYS_PAGE} (sign-in required).`,
    );
  }
  return new Webcite({ apiKey, baseUrl: values['api-url'] });
}

function needArg(arg: string | undefined, what: string): string {
  if (!arg) throw new UsageError(`Pass a ${what}. Run \`webcite --help\` for usage.`);
  return arg;
}

async function extract(values: Values, file: string): Promise<void> {
  const mode = values.mode;
  if (mode !== undefined && mode !== 'lite' && mode !== 'standard')
    throw new UsageError('--mode must be lite or standard.');
  const wc = await client(values);
  const uploaded = await wc.upload(new Uint8Array(await readFile(file)), { filename: basename(file) });
  const doc = await wc.extract({ asset_id: uploaded.data.asset_id, mode });
  if (values.json) return out(JSON.stringify(doc, null, 2));
  process.stderr.write(`${formatExtractSummary(doc)}\n`);
  out(doc.markdown ?? '');
}

async function login(values: Values): Promise<void> {
  const given = await readKey({ openBrowser: !values['no-browser'] });
  if (!given)
    throw new UsageError(`Copy a key from ${KEYS_PAGE} and paste it, or pipe it: \`webcite login < key.txt\`.`);
  const wc = new Webcite({ apiKey: given.apiKey, baseUrl: values['api-url'] });
  await wc.balance();
  const path = await storeKey(given.apiKey, credentialsPath());
  print(values, { stored: path }, () => `Key checked and saved to ${path} (mode 600).`);
}

async function run(argv: readonly string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true });
  const [command, arg] = positionals;
  if (values.version) return out(VERSION);
  if (values.help || !command) return out(HELP);
  switch (command) {
    case 'verify': {
      const result = await (await client(values)).verify(needArg(arg, 'claim'), { source_urls: values['source-url'] });
      return print(values, result, () => formatVerify(result));
    }
    case 'search': {
      const limit = values.limit === undefined ? undefined : Number(values.limit);
      if (limit !== undefined && !Number.isInteger(limit)) throw new UsageError('--limit must be an integer.');
      const result = await (await client(values)).search(needArg(arg, 'query'), { limit });
      return print(values, result, () => formatSearch(result));
    }
    case 'balance': {
      const result = await (await client(values)).balance();
      return print(values, result, () => formatBalance(result));
    }
    case 'extract':
      return extract(values, needArg(arg, 'file path'));
    case 'login':
      return login(values);
    default:
      throw new UsageError(`Unknown command "${command}". Run \`webcite --help\`.`);
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    await run(argv);
    return 0;
  } catch (error) {
    const usage = error instanceof UsageError || (error as { code?: string })?.code?.startsWith('ERR_PARSE_ARGS');
    process.stderr.write(`webcite: ${(error as Error).message ?? String(error)}\n`);
    if (error instanceof WebciteError && error.docUrl) process.stderr.write(`Docs: ${error.docUrl}\n`);
    return usage ? 2 : 1;
  }
}
