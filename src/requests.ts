/**
 * Request builders. The client only sends these specs; test/contract.test.ts checks every path
 * and method against the public OpenAPI document. Option names match the API's field names.
 */

import type { BatchItem, JSONObject } from './types.js';

export interface RequestSpec {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly json?: JSONObject;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly form?: { readonly file: FileUpload; readonly fields?: Readonly<Record<string, string>> };
  readonly idempotencyKey?: string;
  readonly stream?: boolean;
}

export type FileInput = Blob | Uint8Array | ArrayBuffer;
export interface FileUpload {
  readonly data: FileInput;
  readonly filename: string;
}

export interface VerifyOptions {
  readonly source_urls?: readonly string[];
  readonly filters?: JSONObject;
  readonly thread_id?: string;
  readonly include_stance?: boolean;
  readonly include_verdict?: boolean;
  readonly decompose_claim?: boolean;
  readonly include_numeric_assess?: boolean;
  readonly include_source_reads?: boolean;
  readonly evidence_scope?: JSONObject;
  /** Sent as Idempotency-Key. A random key is used when omitted, so retries are safe. */
  readonly idempotency_key?: string;
}

export type VerifyStreamOptions = Pick<
  VerifyOptions,
  'source_urls' | 'filters' | 'thread_id' | 'include_stance' | 'include_verdict' | 'decompose_claim'
>;

export interface AssetRef {
  readonly asset_id?: string;
  readonly asset_url?: string;
}

export interface ExtractOptions extends AssetRef {
  readonly mode?: 'standard' | 'lite';
  readonly refresh?: boolean;
}

export interface SourcePreviewOptions {
  readonly url?: string;
  readonly asset_id?: string;
  readonly page?: number;
  readonly quote?: string;
  readonly title?: string;
  readonly cell?: string;
  readonly full?: boolean;
  readonly highlight_terms?: readonly string[];
  readonly source_version_id?: string;
  readonly representation_id?: string;
  readonly source_unit_id?: string;
}

export interface AskOptions {
  readonly documentName?: string;
  readonly hasTextLayer?: boolean;
  readonly topK?: number;
}

const seg = (value: string): string => {
  if (typeof value !== 'string' || !value) throw new TypeError('Path identifiers must be non-empty strings.');
  return encodeURIComponent(value);
};

/** Drop options the caller did not pass, so server defaults apply. */
const compact = (fields: Readonly<Record<string, unknown>>): JSONObject =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));

const asset = (ref: AssetRef): JSONObject => {
  if (!ref.asset_id && !ref.asset_url) throw new TypeError('Pass asset_id (from upload) or asset_url.');
  return compact({ asset_id: ref.asset_id, asset_url: ref.asset_url });
};

/** A unique Idempotency-Key. Uses Web Crypto where present (Node 19+, browsers, edge). */
export function randomKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

const post = (path: string, json?: JSONObject): RequestSpec => ({ method: 'POST', path, json });
const get = (path: string, query?: RequestSpec['query']): RequestSpec => ({ method: 'GET', path, query });

export function verify(claim: string, options: VerifyOptions = {}): RequestSpec {
  const { idempotency_key, ...rest } = options;
  return {
    ...post('/api/v1/verify', compact({ claim, ...rest })),
    idempotencyKey: idempotency_key ?? randomKey(),
  };
}

export const verifyStream = (claim: string, options: VerifyStreamOptions = {}): RequestSpec => ({
  ...post('/api/v1/verify/stream', compact({ claim, ...options })),
  stream: true,
});

export const verifyBatch = (items: readonly BatchItem[], evidence_scope?: JSONObject): RequestSpec =>
  post('/api/v1/verify/batch', compact({ items, evidence_scope }));

export const verifyFeedback = (token: string, verdict: 'correct' | 'incorrect' | 'unsure', note?: string) =>
  post('/api/v1/verify/feedback', compact({ token, verdict, note }));

export const verifyNumeric = (body: JSONObject): RequestSpec => post('/api/v2/verify/numeric', body);

export const search = (query: string, options: { limit?: number; filters?: JSONObject } = {}) =>
  post('/api/v1/sources/search', compact({ query, ...options }));

export const listCitations = (
  options: { page?: number; limit?: number; fields?: string; thread_id?: string } = {},
): RequestSpec => get('/api/v1/citations', options);

export const getCitation = (id: string): RequestSpec => get(`/api/v1/citations/${seg(id)}`);

export function sourcePreview(options: SourcePreviewOptions): RequestSpec {
  const body = compact({ ...options });
  if (Object.keys(body).length === 0) {
    throw new TypeError('Pass url, or asset_id with page, quote or source_unit_id.');
  }
  return post('/api/v1/citations/source-preview', body);
}

export const upload = (file: FileUpload): RequestSpec => ({ method: 'POST', path: '/api/v1/upload', form: { file } });

export const uploadUrl = (url: string, filename?: string): RequestSpec =>
  post('/api/v1/upload/url', compact({ url, filename }));

export const extract = (sub: '' | '/pages' | '/figures' | '/visual-rendition', ref: AssetRef, extra: JSONObject = {}) =>
  post(`/api/v1/extract${sub}`, { ...asset(ref), ...compact(extra) });

export const classify = (ref: AssetRef, taxonomy?: 'vc' | 'ma'): RequestSpec =>
  post('/api/v1/classify', { ...asset(ref), ...compact({ taxonomy }) });

export const gaps = (
  category: string,
  docs: readonly JSONObject[],
  options: { stage?: 'early' | 'growth'; taxonomy?: 'vc' | 'ma' } = {},
): RequestSpec => post('/api/v1/gaps', compact({ category, docs, ...options }));

export const ask = (question: string, documentText: string, options: AskOptions = {}): RequestSpec =>
  post('/api/v1/ask', compact({ question, documentText, ...options }));

export const getAsk = (id: string): RequestSpec => get(`/api/v1/ask/${seg(id)}`);

export const analyzeConflicts = (
  figures: readonly JSONObject[],
  options: { fxRates?: readonly JSONObject[]; precedenceRules?: readonly JSONObject[] } = {},
): RequestSpec => post('/api/v1/analyze/conflicts', compact({ figures, ...options }));

export const analyzeDocument = (asset_id: string): RequestSpec => post('/api/v1/analyze/document', { asset_id });

export const accuracy = (): RequestSpec => get('/api/v1/accuracy');

/**
 * Account route used by the Webcite MCP server's get_credit_balance tool. It accepts an API key
 * but is not in the public OpenAPI document; the contract test lists it as the one exception.
 */
export const balance = (): RequestSpec => get('/api/v1/payment/credits/balance');

export const registerSource = (assetId: string, file: FileUpload): RequestSpec => ({
  method: 'POST',
  path: '/api/v2/sources',
  form: { file, fields: { assetId } },
});

const rep = (versionId: string, rest = ''): string => `/api/v2/sources/${seg(versionId)}/representations${rest}`;

export const publishTextRepresentation = (versionId: string): RequestSpec => post(rep(versionId, '/text'));
export const latestRepresentation = (versionId: string): RequestSpec => get(rep(versionId, '/latest'));
export const sourceUnit = (versionId: string, representationId: string, unitId: string): RequestSpec =>
  get(rep(versionId, `/${seg(representationId)}/units/${seg(unitId)}`));
export const prepareOcrRescue = (versionId: string, representationId: string): RequestSpec =>
  post(rep(versionId, `/${seg(representationId)}/prepare-ocr-rescue`));

export const ASK_TERMINAL: readonly string[] = ['done', 'failed'];
