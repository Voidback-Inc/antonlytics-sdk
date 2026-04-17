// ─────────────────────────────────────────────────────────────────────────────
// @antonlytics/sdk — Public API
// ─────────────────────────────────────────────────────────────────────────────

// Main client
export { Antonlytics } from "./client.js";

// Errors
export { AntoError, isAntoError } from "./errors.js";

// Query builder classes (for advanced use)
export { QueryBuilder, EntityBuilder } from "./query.js";

// Low-level utilities (for custom integrations)
export { Emitter }              from "./emitter.js";
export type { EmitFn }          from "./emitter.js";
export { RateLimiter }          from "./limiter.js";
export type { HttpConfig }      from "./http.js";

// All TypeScript types
export type {
  AntonlyticsConfig,
  SdkEvents,

  // Triplets
  EntityRef,
  Triplet,
  IngestOptions,
  BatchIngestOptions,
  IngestResult,
  IngestionEvent,
  IngestionStatus,
  PollOptions,

  // Ontology
  OntologyTree,
  EntityTypeDef,
  PropertyDef,
  RelationshipDef,

  // Query
  QueryPayload,
  QueryResult,
  EntitySpec,
  QueryFilter,
  FilterOperator,
  OrderBySpec,
  RelationshipSpec,

  // Dashboard
  DashboardMetrics,
  DashboardSummary,

  // Projects
  Project,
  CreateProjectOptions,
  GraphStats,

  // Misc
  UUID,
  ISODateString,
  DateString,
  AntoErrorDetails,
} from "./types.js";
