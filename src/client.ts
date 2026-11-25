/** The Webcite client. Works in Node 18+, Deno, Bun, browsers and edge runtimes. */

import * as R from './requests.js';
import { type ClientOptions, type Config, resolveConfig, sendJson, sleep, streamEvents } from './transport.js';
import type {
  AskJob,
  Balance,
  BatchItem,
  CitationList,
  ExtractResponse,
  JSONObject,
  StreamEvent,
  UploadResponse,
  VerifyResponse,
} from './types.js';

export interface UploadOptions {
  /** Required for bytes; the extension decides how the file is read. */
  readonly filename?: string;
}

/**
 * Client for the Webcite API. GET requests and verifications (sent with an Idempotency-Key)
 * are retried on 429 and 5xx; other calls are never repeated automatically.
 */
export class Webcite {
  readonly #config: Config;

  constructor(options: ClientOptions = {}) {
    this.#config = resolveConfig(options);
  }

  get baseUrl(): string {
    return this.#config.baseUrl;
  }

  #send<T>(spec: R.RequestSpec): Promise<T> {
    return sendJson<T>(this.#config, spec);
  }

  /** Verify one claim against web sources (POST /api/v1/verify). 4 credits by default. */
  verify(claim: string, options?: R.VerifyOptions): Promise<VerifyResponse> {
    return this.#send(R.verify(claim, options));
  }

  /** Stream verification events. Throws IncompleteStreamError without a result and done. */
  verifyStream(claim: string, options?: R.VerifyStreamOptions): AsyncGenerator<StreamEvent> {
    return streamEvents(this.#config, R.verifyStream(claim, options));
  }

  /** Check quotes against their sources in one call (POST /api/v1/verify/batch). */
  verifyBatch(items: readonly BatchItem[], options: { evidence_scope?: JSONObject } = {}): Promise<JSONObject[]> {
    return this.#send(R.verifyBatch(items, options.evidence_scope));
  }

  /** Record correct, incorrect or unsure on a verification result. */
  verifyFeedback(token: string, verdict: 'correct' | 'incorrect' | 'unsure', note?: string): Promise<JSONObject> {
    return this.#send(R.verifyFeedback(token, verdict, note));
  }

  /** Check numeric arithmetic (POST /api/v2/verify/numeric). */
  verifyNumeric(body: JSONObject): Promise<JSONObject> {
    return this.#send(R.verifyNumeric(body));
  }

  /** Search for sources (POST /api/v1/sources/search). */
  search(query: string, options?: { limit?: number; filters?: JSONObject }): Promise<VerifyResponse> {
    return this.#send(R.search(query, options));
  }

  listCitations(options?: {
    page?: number;
    limit?: number;
    fields?: string;
    thread_id?: string;
  }): Promise<CitationList> {
    return this.#send(R.listCitations(options));
  }

  getCitation(id: string): Promise<JSONObject> {
    return this.#send(R.getCitation(id));
  }

  /** Show the evidence passage at a URL or in an uploaded file. */
  sourcePreview(options: R.SourcePreviewOptions): Promise<JSONObject> {
    return this.#send(R.sourcePreview(options));
  }

  /** Store a file (Blob, File, Uint8Array or ArrayBuffer). Free. Keep data.asset_id. */
  upload(file: R.FileInput, options: UploadOptions = {}): Promise<UploadResponse> {
    return this.#send(R.upload({ data: file, filename: filenameFor(file, options.filename) }));
  }

  /** Store the file at a public HTTPS URL. */
  uploadUrl(url: string, options: { filename?: string } = {}): Promise<UploadResponse> {
    return this.#send(R.uploadUrl(url, options.filename));
  }

  /** Read a document as Markdown with per-page units. The request stays open until every page is read. */
  extract(options: R.ExtractOptions): Promise<ExtractResponse> {
    const { mode, refresh, ...ref } = options;
    return this.#send(R.extract('', ref, { mode, refresh }));
  }

  extractVisualRendition(options: R.AssetRef & { source_version_id?: string; refresh?: boolean }): Promise<JSONObject> {
    const { source_version_id, refresh, ...ref } = options;
    return this.#send(R.extract('/visual-rendition', ref, { visual_rendition: true, source_version_id, refresh }));
  }

  /** Extract anchored chunks ready to index and cite. */
  extractPages(options: R.AssetRef & { mode?: 'standard' | 'lite' }): Promise<JSONObject> {
    const { mode, ...ref } = options;
    return this.#send(R.extract('/pages', ref, { mode }));
  }

  /** Extract every recognised number as a tagged, source-grounded figure. */
  extractFigures(options: R.AssetRef): Promise<JSONObject> {
    return this.#send(R.extract('/figures', options));
  }

  classify(options: R.AssetRef & { taxonomy?: 'vc' | 'ma' }): Promise<JSONObject> {
    const { taxonomy, ...ref } = options;
    return this.#send(R.classify(ref, taxonomy));
  }

  gaps(
    category: string,
    docs: readonly JSONObject[],
    options?: { stage?: 'early' | 'growth'; taxonomy?: 'vc' | 'ma' },
  ): Promise<JSONObject> {
    return this.#send(R.gaps(category, docs, options));
  }

  /** Queue a question over document text. Poll with getAsk() or waitForAsk(). */
  ask(question: string, documentText: string, options?: R.AskOptions): Promise<AskJob> {
    return this.#send(R.ask(question, documentText, options));
  }

  getAsk(id: string): Promise<AskJob> {
    return this.#send(R.getAsk(id));
  }

  /** Poll until done or failed. After maxWaitMs, resolves with the latest job view unchanged. */
  async waitForAsk(id: string, options: { pollIntervalMs?: number; maxWaitMs?: number } = {}): Promise<AskJob> {
    const { pollIntervalMs = 2000, maxWaitMs = 600_000 } = options;
    const started = Date.now();
    for (;;) {
      const job = await this.getAsk(id);
      if (R.ASK_TERMINAL.includes(String(job.status)) || Date.now() - started >= maxWaitMs) return job;
      await sleep(pollIntervalMs);
    }
  }

  analyzeConflicts(
    figures: readonly JSONObject[],
    options?: { fxRates?: readonly JSONObject[]; precedenceRules?: readonly JSONObject[] },
  ): Promise<JSONObject> {
    return this.#send(R.analyzeConflicts(figures, options));
  }

  analyzeDocument(assetId: string): Promise<JSONObject> {
    return this.#send(R.analyzeDocument(assetId));
  }

  accuracy(): Promise<JSONObject> {
    return this.#send(R.accuracy());
  }

  /** Read remaining, used and total credits. Free. */
  balance(): Promise<Balance> {
    return this.#send(R.balance());
  }

  registerSource(assetId: string, file: R.FileInput, options: UploadOptions = {}): Promise<JSONObject> {
    return this.#send(R.registerSource(assetId, { data: file, filename: filenameFor(file, options.filename) }));
  }

  publishTextRepresentation(versionId: string): Promise<JSONObject> {
    return this.#send(R.publishTextRepresentation(versionId));
  }

  latestRepresentation(versionId: string): Promise<JSONObject> {
    return this.#send(R.latestRepresentation(versionId));
  }

  sourceUnit(versionId: string, representationId: string, unitId: string): Promise<JSONObject> {
    return this.#send(R.sourceUnit(versionId, representationId, unitId));
  }

  prepareOcrRescue(versionId: string, representationId: string): Promise<JSONObject> {
    return this.#send(R.prepareOcrRescue(versionId, representationId));
  }
}

function filenameFor(file: R.FileInput, filename: string | undefined): string {
  const name = filename ?? (typeof File !== 'undefined' && file instanceof File ? file.name : undefined);
  if (!name) throw new TypeError('Pass { filename } with bytes; its extension decides how the file is read.');
  return name;
}
