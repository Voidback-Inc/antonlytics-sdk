import { AntoError } from "./errors.js";
import type { HttpClient } from "./http.js";
import type { EmitFn } from "./emitter.js";
import type {
  IngestOptions, IngestResult, BatchIngestOptions,
  IngestionEvent, PollOptions, SdkEvents, Triplet,
} from "./types.js";

export class IngestModule {
  constructor(
    private readonly http: HttpClient,
    private readonly emit: EmitFn<SdkEvents>,
  ) {}

  /**
   * Ingest one or more triplets into the knowledge graph.
   *
   * Batches ≤ 100 triplets are processed **synchronously** and return results immediately.
   * Batches > 100 are queued for **async** background processing — use `.track()` to auto-poll.
   *
   * @example
   * const result = await anto.ingest.send({
   *   projectId: "proj_abc",
   *   triplets: {
   *     subject:  { type: "Customer", id: "cust_1", properties: { name: "Alice", country: "USA" } },
   *     predicate: "PURCHASED",
   *     object:   { type: "Product",  id: "prod_5", properties: { title: "Laptop Pro", price: 999 } },
   *     relationship_properties: { quantity: 2 },
   *   },
   * });
   */
  async send(options: IngestOptions): Promise<IngestResult> {
    const list = Array.isArray(options.triplets) ? options.triplets : [options.triplets];

    if (list.length === 0) {
      throw new AntoError({ status: 400, code: "BAD_REQUEST", message: "At least one triplet is required." });
    }

    const result = await this.http.post<IngestResult>("/ingest/", {
      project_id: options.projectId,
      triplets: list,
    });

    this.emit("ingest_queued", { event_id: result.event_id, triplets_count: list.length });
    return result;
  }

  /**
   * Poll an async ingestion event until it reaches `done` or `failed`.
   *
   * @example
   * const event = await anto.ingest.poll("event-id", {
   *   interval: 1000,
   *   onStatus: (e) => console.log(e.status),
   * });
   */
  async poll(eventId: string, options: PollOptions = {}): Promise<IngestionEvent> {
    const { interval = 1_000, timeout = 60_000, onStatus } = options;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const res = await this.http.get<{ success: boolean; event: IngestionEvent }>(
        `/ingest/events/${eventId}/`
      );
      const event = res.event;
      onStatus?.(event);
      this.emit("ingest_queued", { event_id: eventId, triplets_count: event.triplets_count });

      if (event.status === "done") {
        this.emit("ingest_done", { event_id: eventId, triplets_count: event.triplets_count });
        return event;
      }
      if (event.status === "failed") {
        this.emit("ingest_failed", { event_id: eventId, error: event.error_message ?? "Unknown error" });
        throw new AntoError({
          status: 500,
          code: "INGESTION_FAILED",
          message: event.error_message ?? "Ingestion failed",
          details: event,
        });
      }

      await sleep(interval);
    }

    throw new AntoError({
      status: 0,
      code: "POLL_TIMEOUT",
      message: `Ingestion event ${eventId} did not complete within ${timeout}ms`,
    });
  }

  /**
   * Ingest triplets and automatically poll if the job is async.
   * The safest way to ingest — handles both sync and async transparently.
   *
   * @example
   * const result = await anto.ingest.track({
   *   projectId: "proj_abc",
   *   triplets: myTriplets,
   * }, {
   *   onStatus: (e) => console.log("Status:", e.status),
   * });
   */
  async track(
    options: IngestOptions,
    pollOptions?: PollOptions,
  ): Promise<IngestResult | IngestionEvent> {
    const result = await this.send(options);
    if (!result.async) {
      this.emit("ingest_done", {
        event_id: result.event_id,
        triplets_count: Array.isArray(options.triplets) ? options.triplets.length : 1,
        results: result.results,
      });
      return result;
    }
    return this.poll(result.event_id, pollOptions);
  }

  /**
   * Ingest a large array in chunks with progress callbacks.
   * Each chunk is sent as a separate HTTP request, avoiding payload size limits.
   *
   * @example
   * await anto.ingest.batch({
   *   projectId: "proj_abc",
   *   triplets: thousandsOfTriplets,
   *   chunkSize: 200,
   *   onChunk: (i, total) => console.log(`Chunk ${i}/${total} done`),
   * });
   */
  async batch(options: BatchIngestOptions): Promise<(IngestResult | IngestionEvent)[]> {
    const { projectId, triplets, chunkSize = 200, onChunk, pollOptions } = options;
    const chunks: Triplet[][] = [];
    for (let i = 0; i < triplets.length; i += chunkSize) {
      chunks.push(triplets.slice(i, i + chunkSize));
    }

    const results: (IngestResult | IngestionEvent)[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const r = await this.track({ projectId, triplets: chunks[i] }, pollOptions);
      results.push(r);
      onChunk?.(i + 1, chunks.length, r as IngestResult);
    }
    return results;
  }

  /**
   * Get the ingestion event history for a project.
   */
  async history(projectId: string): Promise<IngestionEvent[]> {
    const res = await this.http.get<{ success: boolean; events: IngestionEvent[] }>(
      `/ingest/history/${projectId}/`
    );
    return res.events ?? [];
  }

  /**
   * Get the current status of an ingestion event.
   */
  async status(eventId: string): Promise<IngestionEvent> {
    const res = await this.http.get<{ success: boolean; event: IngestionEvent }>(
      `/ingest/events/${eventId}/`
    );
    return res.event;
  }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
