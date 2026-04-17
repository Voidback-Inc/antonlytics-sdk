import { HttpClient, type HttpConfig } from "./http.js";
import { IngestModule }   from "./ingest.js";
import { QueryModule }    from "./query.js";
import { ProjectsModule, DashboardModule } from "./resources.js";
import { AntoError }      from "./errors.js";
import { Emitter }        from "./emitter.js";
import { RateLimiter }    from "./limiter.js";
import type { AntonlyticsConfig, SdkEvents } from "./types.js";

/**
 * # Antonlytics JavaScript SDK
 *
 * The main entry point. Create one instance and reuse it across your application.
 *
 * ---
 *
 * ## Quick start
 *
 * ```ts
 * import { Antonlytics } from "@antonlytics/sdk";
 *
 * const anto = new Antonlytics({ apiKey: "anto_live_xxxx" });
 *
 * // Ingest a relationship triplet
 * await anto.ingest.track({
 *   projectId: "proj_abc",
 *   triplets: {
 *     subject:  { type: "Customer", id: "cust_1", properties: { name: "Alice", country: "USA" } },
 *     predicate: "PURCHASED",
 *     object:   { type: "Product",  id: "prod_5", properties: { title: "Laptop Pro", price: 999 } },
 *   },
 * });
 *
 * // Query the knowledge graph
 * const { rows } = await anto.query
 *   .build("proj_abc")
 *   .select("Customer", "c1")
 *     .properties("name", "email", "country")
 *     .eq("country", "USA")
 *     .gte("age", 18)
 *   .done()
 *   .orderBy("age", "desc")
 *   .limit(50)
 *   .run();
 *
 * // Dashboard metrics
 * const metrics = await anto.dashboard.metrics("proj_abc");
 * console.log(metrics.summary.active_entities);
 * ```
 */
export class Antonlytics {
  /** Ingest triplets into the knowledge graph */
  public readonly ingest:    IngestModule;
  /** Build and execute ontology queries */
  public readonly query:     QueryModule;
  /** Dashboard metrics and chart data */
  public readonly dashboard: DashboardModule;
  /** Project management */
  public readonly projects:  ProjectsModule;

  private readonly _emitter: Emitter<SdkEvents>;
  private readonly _http:    HttpClient;

  constructor(config: AntonlyticsConfig) {
    // ── Validation ──────────────────────────────────────────────────────────
    if (!config.apiKey || typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
      throw new AntoError({
        status: 0, code: "INVALID_CONFIG",
        message: "apiKey is required. Get yours at app.antonlytics.com → API Keys.",
      });
    }

    if (!config.apiKey.startsWith("anto_")) {
      throw new AntoError({
        status: 0, code: "INVALID_API_KEY",
        message: `Invalid API key format. Antonlytics keys start with "anto_live_". Got: "${config.apiKey.slice(0, 12)}..."`,
      });
    }

    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new AntoError({
        status: 0, code: "MISSING_FETCH",
        message: "fetch is not available in this environment. " +
                 "Use Node.js 18+ or pass a fetch polyfill via config.fetch.",
      });
    }

    // ── Resolved config ─────────────────────────────────────────────────────
    const httpCfg: HttpConfig = {
      apiKey:  config.apiKey,
      baseUrl: config.baseUrl  ?? "https://api.antonlytics.com",
      timeout: config.timeout  ?? 30_000,
      retries: config.retries  ?? 2,
      debug:   config.debug    ?? false,
      fetch:   fetchImpl,
    };

    // ── Wire modules ─────────────────────────────────────────────────────────
    this._emitter  = new Emitter<SdkEvents>();
    const limiter  = config.rateLimit ? new RateLimiter(config.rateLimit) : undefined;
    this._http     = new HttpClient(httpCfg, this._emitter, limiter);

    this.ingest    = new IngestModule(this._http, this._emitter.emit.bind(this._emitter));
    this.query     = new QueryModule(this._http, this._emitter.emit.bind(this._emitter));
    this.dashboard = new DashboardModule(this._http);
    this.projects  = new ProjectsModule(this._http);
  }

  // ── Event subscriptions ───────────────────────────────────────────────────

  /**
   * Subscribe to an SDK lifecycle event.
   * Returns an unsubscribe function.
   *
   * **Available events:**
   * - `request`        — before every HTTP request
   * - `response`       — after every successful response
   * - `retry`          — when a request is automatically retried
   * - `error`          — when a request fails after all retries
   * - `ingest_queued`  — when an ingestion job is submitted
   * - `ingest_done`    — when an ingestion job completes
   * - `ingest_failed`  — when an ingestion job fails
   * - `query_executed` — after a query returns results
   * - `plan_limit_hit` — when the API returns a 402 limit error
   *
   * @example
   * anto.on("request",  ({ method, path }) => console.log(`→ ${method} ${path}`));
   * anto.on("error",    ({ error }) => Sentry.captureException(error));
   * anto.on("ingest_done", ({ event_id, triplets_count }) => {
   *   console.log(`Ingested ${triplets_count} triplets (event ${event_id})`);
   * });
   */
  on<K extends keyof SdkEvents>(event: K, fn: (payload: SdkEvents[K]) => void): () => void {
    return this._emitter.on(event, fn);
  }

  /** Subscribe once, then auto-remove. */
  once<K extends keyof SdkEvents>(event: K, fn: (payload: SdkEvents[K]) => void): () => void {
    return this._emitter.once(event, fn);
  }

  /** Remove all listeners (optionally for one event). */
  removeAllListeners(event?: keyof SdkEvents): void {
    this._emitter.removeAll(event);
  }
}
