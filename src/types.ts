/**
 * Response types. Responses are the server's JSON; these interfaces describe documented fields.
 * Fields can be missing or null. A null value means the server did not know it, not zero, so
 * keep nulls as they are when you store a response.
 */

export type JSONObject = Record<string, unknown>;

export interface Usage {
  readonly credits?: number | null;
  readonly pages?: number | null;
  readonly page_charges?: readonly JSONObject[];
}

export interface CreditUsage {
  readonly credits_used?: number | null;
  readonly credits_remaining?: number | null;
  readonly monthly_allocation?: number | null;
  readonly overage_enabled?: boolean | null;
  readonly operation_id?: string | null;
}

export interface StanceBreakdown {
  readonly supports?: number;
  readonly partially_supports?: number;
  readonly contradicts?: number;
  readonly neutral?: number;
  readonly inconclusive?: number;
  readonly irrelevant?: number;
  readonly unknown?: number;
}

export interface Verdict {
  readonly claim?: string;
  readonly result?: string;
  readonly confidence?: number | null;
  readonly summary?: string;
  readonly stance_breakdown?: StanceBreakdown;
  readonly origin_count?: number;
  readonly document_count?: number;
  readonly insufficient_evidence?: boolean;
  readonly key_findings?: readonly JSONObject[];
  readonly corrections?: readonly JSONObject[];
  readonly confidence_basis?: string;
  readonly confidence_available?: boolean;
  readonly confidence_meaning?: string;
}

export interface Citation {
  readonly id?: string;
  readonly title?: string;
  readonly url?: string;
  readonly snippet?: string;
  readonly status?: string;
  readonly source_type?: string;
  readonly stance?: string;
  readonly stance_confidence?: number | null;
  readonly stance_explanation?: string;
  readonly credibility_score?: number | null;
  readonly rank?: number;
  readonly group_id?: string;
  readonly is_group_primary?: boolean;
  readonly source_metadata?: JSONObject;
}

export interface DomainGroup {
  readonly group_id?: string;
  readonly domain?: string;
  readonly domain_category?: string;
  readonly group_stance?: string;
  readonly citation_ids?: readonly string[];
  readonly primary_citation_id?: string;
}

export interface ClaimGroup {
  readonly claim_id?: string;
  readonly claim_index?: number;
  readonly claim?: string;
  readonly stance_summary?: string;
  readonly citation_count?: number;
  readonly citations?: readonly Citation[];
  readonly domain_groups?: readonly DomainGroup[];
  readonly verdict?: Verdict;
}

/** Returned by verify() and search(). */
export interface VerifyResponse {
  readonly claim_groups?: readonly ClaimGroup[];
  readonly citations?: readonly Citation[];
  readonly domain_groups?: readonly DomainGroup[];
  readonly verdict?: Verdict;
  readonly totalResults?: number;
  readonly thread_id?: string;
  readonly operation_id?: string;
  readonly search_metadata?: JSONObject;
  readonly usage?: Usage;
  readonly credit_usage?: CreditUsage;
  readonly [key: string]: unknown;
}

export interface ExtractUnit {
  readonly kind?: string;
  readonly index?: number;
  readonly text?: string;
  readonly provenance?: JSONObject;
  readonly elements?: readonly JSONObject[];
  readonly geometry?: JSONObject;
  readonly extraction_method?: string;
  readonly reader?: JSONObject;
}

export interface ExtractResponse {
  readonly format?: string;
  readonly markdown?: string;
  readonly units?: readonly ExtractUnit[];
  readonly state?: string;
  readonly code?: string | null;
  readonly reason?: string | null;
  readonly complete?: boolean;
  readonly lost?: readonly JSONObject[];
  readonly extraction_method?: string;
  readonly operation_id?: string;
  readonly usage?: Usage;
  readonly credit_usage?: CreditUsage;
  readonly [key: string]: unknown;
}

export interface UploadedAsset {
  readonly asset_id: string;
  readonly asset_url?: string;
  readonly source_version_id?: string;
  readonly filename?: string;
  readonly size?: number;
}

export interface UploadResponse {
  readonly successCode?: number;
  readonly message?: string;
  readonly data: UploadedAsset;
  readonly operation_id?: string;
  readonly usage?: Usage;
  readonly credit_usage?: CreditUsage;
}

export interface CitationList {
  readonly statusCode?: number;
  readonly message?: string;
  readonly data?: readonly JSONObject[];
  readonly pagination?: JSONObject;
}

export interface AskJob {
  readonly id: string;
  readonly status?: string;
  readonly operation_id?: string;
  readonly billing_status?: string;
  readonly billing?: JSONObject;
  readonly result?: JSONObject;
  readonly usage?: Usage;
  readonly [key: string]: unknown;
}

export interface Balance {
  readonly credits?: { readonly used?: number; readonly remaining?: number; readonly total?: number };
  readonly allow_overage?: boolean;
  readonly monthly_allocation?: string;
  readonly billing_period_start?: string;
  readonly billing_period_end?: string;
  readonly [key: string]: unknown;
}

export interface StreamEvent {
  readonly event: string;
  readonly data: unknown;
}

export interface BatchItem {
  readonly quote: string;
  readonly id?: string;
  readonly url?: string;
  readonly asset_id?: string;
  readonly page?: number;
  readonly source_text?: string;
  readonly source_version_id?: string;
  readonly representation_id?: string;
  readonly source_unit_id?: string;
  readonly meaning?: 'changed' | 'ambiguous';
}
