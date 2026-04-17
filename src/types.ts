// ─────────────────────────────────────────────────────────────────────────────
// @antonlytics/sdk — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

// ── Client configuration ──────────────────────────────────────────────────────

export interface AntonlyticsConfig {
  /**
   * Your Antonlytics API key.
   * Format: `anto_live_<random>`
   * Obtain from: app.antonlytics.com → API Keys
   */
  apiKey: string;
  /**
   * Base URL of your Antonlytics backend.
   * @default "https://api.antonlytics.com"
   */
  baseUrl?: string;
  /** Request timeout in milliseconds. @default 30_000 */
  timeout?: number;
  /** Automatic retries on 5xx / network errors. @default 2 */
  retries?: number;
  /** Log HTTP requests and responses to the console. @default false */
  debug?: boolean;
  /** Custom fetch implementation (Node 16, test mocks, edge runtimes). */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Client-side rate limiting — prevents bursting more than N requests per window. */
  rateLimit?: { maxRequests: number; windowMs: number };
}

// ── Primitives ────────────────────────────────────────────────────────────────

export type UUID = string;
export type ISODateString = string;
export type DateString = string; // "YYYY-MM-DD"

// ── Triplets ──────────────────────────────────────────────────────────────────

export interface EntityRef {
  /** Entity type name, e.g. "Customer", "Product", "Order" */
  type: string;
  /** Stable external ID used for deduplication. If omitted, a new entity is created each time. */
  id?: string;
  /** Arbitrary key-value properties to store on this entity node. */
  properties?: Record<string, unknown>;
}

export interface Triplet {
  subject: EntityRef;
  /** Relationship predicate name, e.g. "PURCHASED", "BELONGS_TO", "FOLLOWS" */
  predicate: string;
  object: EntityRef;
  /** Optional properties stored on the relationship edge. */
  relationship_properties?: Record<string, unknown>;
}

// ── Ingestion ─────────────────────────────────────────────────────────────────

export interface IngestOptions {
  /** The project to ingest into. */
  projectId: string;
  /** A single triplet or array of triplets to ingest. */
  triplets: Triplet | Triplet[];
}

export interface BatchIngestOptions {
  projectId: string;
  triplets: Triplet[];
  /** How many triplets to send per HTTP request. @default 200 */
  chunkSize?: number;
  /** Called after each chunk is sent. */
  onChunk?: (chunkIndex: number, totalChunks: number, result: IngestResult) => void;
  /** Polling options for async chunks. */
  pollOptions?: PollOptions;
}

export type IngestionStatus = "pending" | "processing" | "done" | "failed";

export interface IngestResult {
  success: boolean;
  event_id: UUID;
  /** true when the batch was queued for async background processing (>100 triplets) */
  async: boolean;
  message?: string;
  results?: {
    created_entities: number;
    updated_entities: number;
    created_relationships: number;
    errors: Array<{ index: number; error: string }>;
  };
}

export interface IngestionEvent {
  id: UUID;
  status: IngestionStatus;
  triplets_count: number;
  error_message?: string;
  processed_at: ISODateString | null;
  created_at: ISODateString;
}

export interface PollOptions {
  /** Poll interval in ms. @default 1_000 */
  interval?: number;
  /** Max total wait time in ms before giving up. @default 60_000 */
  timeout?: number;
  /** Called on every status check. */
  onStatus?: (event: IngestionEvent) => void;
}

// ── Ontology ──────────────────────────────────────────────────────────────────

export interface PropertyDef {
  name: string;
  type: "str" | "int" | "float" | "bool" | "list" | "dict" | string;
}

export interface RelationshipDef {
  name: string;
  target: string;
}

export interface EntityTypeDef {
  id: UUID | null;
  properties: PropertyDef[];
  relationships: RelationshipDef[];
}

export type OntologyTree = Record<string, EntityTypeDef>;

// ── Query ─────────────────────────────────────────────────────────────────────

export type FilterOperator =
  | "eq" | "neq"
  | "contains" | "starts_with" | "ends_with"
  | "gt" | "gte" | "lt" | "lte";

export interface QueryFilter {
  property: string;
  operator: FilterOperator;
  value: string | number | boolean;
}

export interface RelationshipSpec {
  type: string;
  /** Alias of the target entity node in this query */
  target: string;
}

export interface EntitySpec {
  alias: string;
  type: string;
  properties?: string[];
  filters?: QueryFilter[];
  relationship?: RelationshipSpec;
}

export interface OrderBySpec {
  property: string;
  direction?: "asc" | "desc";
}

export interface QueryPayload {
  entities: EntitySpec[];
  orderBy?: OrderBySpec;
  limit?: number;
  /** Human-readable name shown in query history */
  name?: string;
}

export interface QueryResult {
  success: boolean;
  rows: Array<Record<string, unknown>>;
  total: number;
  columns: string[];
  execution_ms: number;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  events_tracked: number;
  active_entities: number;
  total_relationships: number;
  query_usage: number;
}

export interface DashboardMetrics {
  project_id: UUID;
  project_name: string;
  summary: DashboardSummary;
  charts: {
    event_volume:        { type: "scatter";   label: string; data: Array<{ date: DateString; count: number }> };
    entity_distribution: { type: "pie";       label: string; data: Array<{ name: string; value: number }> };
    relationship_growth: { type: "histogram"; label: string; data: Array<{ date: DateString; new: number; cumulative: number }> };
  };
  top_ontology_queries: Array<{ name: string; count: number }>;
  recent_events: IngestionEvent[];
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface Project {
  id: UUID;
  name: string;
  description: string;
  team: UUID;
  created_by: UUID;
  created_at: ISODateString;
}

export interface CreateProjectOptions {
  name: string;
  description?: string;
  teamId: string;
}

export interface GraphStats {
  total_entities: number;
  total_relationships: number;
  entity_types: number;
  relationship_types: number;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export interface AntoErrorDetails {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface SdkEvents {
  request:           { method: string; path: string; body?: unknown };
  response:          { method: string; path: string; status: number; ms: number };
  retry:             { method: string; path: string; attempt: number; error: Error };
  error:             { method: string; path: string; error: Error };
  ingest_queued:     { event_id: UUID; triplets_count: number };
  ingest_done:       { event_id: UUID; triplets_count: number; results?: IngestResult["results"] };
  ingest_failed:     { event_id: UUID; error: string };
  query_executed:    { project_id: UUID; entity_types: string[]; result_count: number; execution_ms: number };
  plan_limit_hit:    { team_id?: string; used: number; limit: number };
}

