import { describe, it, expect, vi, beforeEach } from "vitest";
import { Antonlytics } from "../src/client.js";
import { AntoError, isAntoError } from "../src/errors.js";
import { QueryBuilder, EntityBuilder } from "../src/query.js";
import { RateLimiter } from "../src/limiter.js";
import { Emitter } from "../src/emitter.js";

// ── Mock fetch factory ────────────────────────────────────────────────────────

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok:         r.status >= 200 && r.status < 300,
      status:     r.status,
      statusText: "OK",
      json:       async () => r.body,
    } as Response;
  });
}

function client(responses: Array<{ status: number; body: unknown }>, retries = 0) {
  return new Antonlytics({
    apiKey:  "anto_live_testkey123456789",
    baseUrl: "http://localhost:8000",
    retries,
    fetch:   mockFetch(responses) as any,
  });
}

// ── Constructor validation ────────────────────────────────────────────────────

describe("Antonlytics constructor", () => {
  it("throws INVALID_CONFIG when apiKey is empty", () => {
    expect(() => new Antonlytics({ apiKey: "" } as any)).toThrow(AntoError);
    try { new Antonlytics({ apiKey: "" } as any); }
    catch (e) { expect((e as AntoError).code).toBe("INVALID_CONFIG"); }
  });

  it("throws INVALID_API_KEY when key does not start with anto_", () => {
    const fn = () => new Antonlytics({ apiKey: "sk_test_wrong", fetch: vi.fn() as any });
    expect(fn).toThrow(AntoError);
    try { fn(); } catch (e) { expect((e as AntoError).code).toBe("INVALID_API_KEY"); }
  });

  it("throws MISSING_FETCH when fetch is unavailable", () => {
    const orig = (globalThis as any).fetch;
    delete (globalThis as any).fetch;
    expect(() => new Antonlytics({ apiKey: "anto_live_x" })).toThrow(AntoError);
    (globalThis as any).fetch = orig;
  });

  it("creates client successfully", () => {
    const anto = client([]);
    expect(anto.ingest).toBeDefined();
    expect(anto.query).toBeDefined();
    expect(anto.dashboard).toBeDefined();
    expect(anto.projects).toBeDefined();
  });
});

// ── AntoError ─────────────────────────────────────────────────────────────────

describe("AntoError", () => {
  it("is an instance of Error", () => {
    const e = new AntoError({ status: 404, code: "NOT_FOUND", message: "Not found" });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AntoError);
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("Not found");
    expect(e.name).toBe("AntoError");
  });

  it("isAntoError identifies AntoError", () => {
    expect(isAntoError(new AntoError({ status: 0, code: "X", message: "x" }))).toBe(true);
    expect(isAntoError(new Error("plain"))).toBe(false);
    expect(isAntoError("string")).toBe(false);
    expect(isAntoError(null)).toBe(false);
  });

  it("toJSON serialises correctly", () => {
    const e = new AntoError({ status: 402, code: "PLAN_LIMIT_REACHED", message: "Over limit", details: { used: 5001, limit: 5000 } });
    const j = e.toJSON();
    expect(j.code).toBe("PLAN_LIMIT_REACHED");
    expect(j.status).toBe(402);
    expect((j.details as any).used).toBe(5001);
  });
});

// ── Ingestion ─────────────────────────────────────────────────────────────────

describe("anto.ingest.send()", () => {
  it("sends triplet as array in body", async () => {
    const fetch = mockFetch([{
      status: 201,
      body: { success: true, event_id: "evt_1", async: false, results: { created_entities: 2, updated_entities: 0, created_relationships: 1, errors: [] } },
    }]);
    const anto = new Antonlytics({ apiKey: "anto_live_x", baseUrl: "http://localhost:8000", retries: 0, fetch: fetch as any });

    const result = await anto.ingest.send({
      projectId: "proj_1",
      triplets: {
        subject:  { type: "Customer", id: "c1", properties: { name: "Alice" } },
        predicate: "PURCHASED",
        object:   { type: "Product",  id: "p1" },
      },
    });

    expect(result.success).toBe(true);
    expect(result.results?.created_entities).toBe(2);

    const sentBody = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(sentBody.project_id).toBe("proj_1");
    expect(sentBody.triplets).toHaveLength(1);
    expect(sentBody.triplets[0].predicate).toBe("PURCHASED");
  });

  it("rejects empty triplets array", async () => {
    const anto = client([]);
    await expect(anto.ingest.send({ projectId: "p", triplets: [] })).rejects.toThrow(AntoError);
  });

  it("emits ingest_queued event", async () => {
    const anto = client([{ status: 201, body: { success: true, event_id: "e1", async: false, results: { created_entities: 1, updated_entities: 0, created_relationships: 0, errors: [] } } }]);
    const events: any[] = [];
    anto.on("ingest_queued", e => events.push(e));
    await anto.ingest.send({ projectId: "p", triplets: { subject: { type: "A", id: "a1" }, predicate: "REL", object: { type: "B", id: "b1" } } });
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe("e1");
  });

  it("throws PLAN_LIMIT_REACHED on 402", async () => {
    const anto = client([{ status: 402, body: { code: "PLAN_LIMIT_REACHED", detail: "Limit reached" } }]);
    const err = await anto.ingest.send({ projectId: "p", triplets: { subject: { type: "A" }, predicate: "R", object: { type: "B" } } }).catch(e => e);
    expect(err).toBeInstanceOf(AntoError);
    expect(err.status).toBe(402);
    expect(err.code).toBe("PLAN_LIMIT_REACHED");
  });
});

describe("anto.ingest.poll()", () => {
  it("resolves when status becomes done", async () => {
    const anto = client([
      { status: 200, body: { success: true, event: { id: "e1", status: "processing", triplets_count: 5, processed_at: null, created_at: "" } } },
      { status: 200, body: { success: true, event: { id: "e1", status: "done",       triplets_count: 5, processed_at: "2026-04-15", created_at: "" } } },
    ]);
    const statuses: string[] = [];
    const event = await anto.ingest.poll("e1", { interval: 0, onStatus: e => statuses.push(e.status) });
    expect(event.status).toBe("done");
    expect(statuses).toEqual(["processing", "done"]);
  });

  it("rejects with INGESTION_FAILED when status is failed", async () => {
    const anto = client([{ status: 200, body: { success: true, event: { id: "e1", status: "failed", triplets_count: 5, error_message: "bad data", processed_at: null, created_at: "" } } }]);
    await expect(anto.ingest.poll("e1", { interval: 0 })).rejects.toMatchObject({ code: "INGESTION_FAILED" });
  });

  it("rejects with POLL_TIMEOUT after timeout", async () => {
    const anto = client([{ status: 200, body: { success: true, event: { id: "e1", status: "processing", triplets_count: 1, processed_at: null, created_at: "" } } }]);
    await expect(anto.ingest.poll("e1", { interval: 0, timeout: 1 })).rejects.toMatchObject({ code: "POLL_TIMEOUT" });
  });
});

describe("anto.ingest.batch()", () => {
  it("splits into chunks and sends one request per chunk", async () => {
    const triplets = Array.from({ length: 7 }, (_, i) => ({
      subject: { type: "X", id: `x${i}` }, predicate: "R", object: { type: "Y", id: `y${i}` },
    }));
    const chunkBody = { success: true, event_id: "e", async: false, results: { created_entities: 3, updated_entities: 0, created_relationships: 3, errors: [] } };
    const anto = client(Array(3).fill({ status: 201, body: chunkBody }));

    const chunks: number[] = [];
    await anto.ingest.batch({ projectId: "p", triplets, chunkSize: 3, onChunk: (i) => chunks.push(i) });

    expect(chunks).toEqual([1, 2, 3]);
  });
});

// ── Query Builder ─────────────────────────────────────────────────────────────

describe("QueryBuilder", () => {
  it("builds correct JSON payload", () => {
    const anto = client([]);
    const payload = anto.query
      .build("proj_1")
      .select("Customer", "c1")
        .properties("name", "email", "country")
        .eq("country", "USA")
        .gte("age", 21)
        .relatesTo("PURCHASED", "p1")
      .done()
      .select("Product", "p1")
        .properties("title", "price")
        .lte("price", 500)
      .done()
      .orderBy("age", "desc")
      .limit(25)
      .name("US adults buying affordable products")
      .toJSON();

    expect(payload.entities).toHaveLength(2);

    const c1 = payload.entities[0];
    expect(c1.alias).toBe("c1");
    expect(c1.type).toBe("Customer");
    expect(c1.properties).toEqual(["name", "email", "country"]);
    expect(c1.filters).toEqual([
      { property: "country", operator: "eq",  value: "USA" },
      { property: "age",     operator: "gte", value: 21 },
    ]);
    expect(c1.relationship).toEqual({ type: "PURCHASED", target: "p1" });

    const p1 = payload.entities[1];
    expect(p1.type).toBe("Product");
    expect(p1.filters?.[0]).toEqual({ property: "price", operator: "lte", value: 500 });

    expect(payload.orderBy).toEqual({ property: "age", direction: "desc" });
    expect(payload.limit).toBe(25);
    expect(payload.name).toBe("US adults buying affordable products");
  });

  it("auto-generates alias when not provided", () => {
    const anto = client([]);
    const payload = anto.query.build("p").select("Customer").done().toJSON();
    expect(payload.entities[0].alias).toBe("customer1");
  });

  it("all filter shorthand methods work", () => {
    const anto = client([]);
    const eb = new EntityBuilder(anto.query.build("p"), "e1", "X");
    eb.eq("a", 1).neq("b", 2).contains("c", "x").startsWith("d", "y").endsWith("e", "z").gt("f", 3).gte("g", 4).lt("h", 5).lte("i", 6);
    const spec = eb._build();
    const ops = spec.filters!.map(f => f.operator);
    expect(ops).toEqual(["eq","neq","contains","starts_with","ends_with","gt","gte","lt","lte"]);
  });

  it("enforces max limit of 1000", () => {
    const anto = client([]);
    const payload = anto.query.build("p").select("X").done().limit(9999).toJSON();
    expect(payload.limit).toBe(1000);
  });
});

describe("anto.query.execute()", () => {
  it("posts payload and emits query_executed", async () => {
    const fetch = mockFetch([{ status: 200, body: { success: true, rows: [{ name: "Alice" }], total: 1, columns: ["name"], execution_ms: 8 } }]);
    const anto = new Antonlytics({ apiKey: "anto_live_x", baseUrl: "http://localhost:8000", retries: 0, fetch: fetch as any });

    const events: any[] = [];
    anto.on("query_executed", e => events.push(e));

    const result = await anto.query.execute("proj_1", { entities: [{ alias: "c1", type: "Customer" }] });
    expect(result.rows).toHaveLength(1);
    expect(result.execution_ms).toBe(8);
    expect(events[0].result_count).toBe(1);
    expect(events[0].entity_types).toEqual(["Customer"]);
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

describe("anto.dashboard.metrics()", () => {
  it("returns full metrics object", async () => {
    const body = {
      success: true, project_id: "p1", project_name: "Test",
      summary: { events_tracked: 42, active_entities: 100, total_relationships: 200, query_usage: 10 },
      charts: {
        event_volume:        { type: "scatter",   label: "Events", data: [{ date: "2026-04-01", count: 5 }] },
        entity_distribution: { type: "pie",       label: "Types",  data: [{ name: "Customer", value: 60 }] },
        relationship_growth: { type: "histogram", label: "Growth", data: [] },
      },
      top_ontology_queries: [{ name: "US customers", count: 8 }],
      recent_events: [],
    };
    const anto = client([{ status: 200, body }]);
    const m = await anto.dashboard.metrics("p1");
    expect(m.summary.active_entities).toBe(100);
    expect(m.charts.event_volume.data[0].count).toBe(5);
    expect(m.top_ontology_queries[0].name).toBe("US customers");
  });
});

// ── Projects ──────────────────────────────────────────────────────────────────

describe("anto.projects", () => {
  it("list() unwraps results array", async () => {
    const anto = client([{ status: 200, body: { results: [{ id: "p1", name: "My Graph" }] } }]);
    const list = await anto.projects.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("My Graph");
  });

  it("create() sends correct body", async () => {
    const fetch = mockFetch([{ status: 201, body: { id: "p2", name: "New" } }]);
    const anto = new Antonlytics({ apiKey: "anto_live_x", baseUrl: "http://localhost:8000", retries: 0, fetch: fetch as any });
    await anto.projects.create({ name: "New", teamId: "t1", description: "Test" });
    const body = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.team_id).toBe("t1");
    expect(body.description).toBe("Test");
  });

  it("stats() returns graph stats", async () => {
    const anto = client([{ status: 200, body: { success: true, stats: { total_entities: 50, total_relationships: 80, entity_types: 3, relationship_types: 2 } } }]);
    const s = await anto.projects.stats("p1");
    expect(s.total_entities).toBe(50);
    expect(s.relationship_types).toBe(2);
  });
});

// ── HTTP error handling ───────────────────────────────────────────────────────

describe("HTTP error handling", () => {
  it("throws AntoError on 401", async () => {
    const anto = client([{ status: 401, body: { detail: "Invalid API key" } }]);
    const e = await anto.projects.list().catch(x => x);
    expect(e).toBeInstanceOf(AntoError);
    expect(e.status).toBe(401);
    expect(e.code).toBe("UNAUTHORIZED");
  });

  it("throws AntoError on 404", async () => {
    const anto = client([{ status: 404, body: { detail: "Not found" } }]);
    const e = await anto.projects.get("missing").catch(x => x);
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
  });

  it("throws AntoError on 402 plan limit", async () => {
    const anto = client([{ status: 402, body: { code: "PLAN_LIMIT_REACHED", detail: "5000 event limit reached on Free plan" } }]);
    const e = await anto.ingest.send({ projectId: "p", triplets: { subject: { type: "A" }, predicate: "R", object: { type: "B" } } }).catch(x => x);
    expect(e.code).toBe("PLAN_LIMIT_REACHED");
    expect(e.status).toBe(402);
  });
});

// ── Event emitter ─────────────────────────────────────────────────────────────

describe("Event Emitter", () => {
  it("on() fires on every event", () => {
    const em = new Emitter<{ ping: { val: number } }>();
    const calls: number[] = [];
    em.on("ping", e => calls.push(e.val));
    em.emit("ping", { val: 1 });
    em.emit("ping", { val: 2 });
    expect(calls).toEqual([1, 2]);
  });

  it("once() fires only once", () => {
    const em = new Emitter<{ ping: { val: number } }>();
    const calls: number[] = [];
    em.once("ping", e => calls.push(e.val));
    em.emit("ping", { val: 1 });
    em.emit("ping", { val: 2 });
    expect(calls).toEqual([1]);
  });

  it("unsubscribe function removes listener", () => {
    const em = new Emitter<{ ping: null }>();
    let count = 0;
    const unsub = em.on("ping", () => count++);
    em.emit("ping", null);
    unsub();
    em.emit("ping", null);
    expect(count).toBe(1);
  });

  it("removeAll clears all listeners", () => {
    const em = new Emitter<{ ping: null }>();
    let count = 0;
    em.on("ping", () => count++);
    em.on("ping", () => count++);
    em.removeAll();
    em.emit("ping", null);
    expect(count).toBe(0);
  });
});

// ── Rate Limiter ──────────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  it("allows up to maxRequests immediately", async () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 10_000 });
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.available).toBe(0);
  });

  it("queues requests beyond limit", async () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 10_000 });
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.available).toBe(0);
    // 3rd acquire should be queued (not throw)
    let queued = false;
    limiter.acquire().then(() => { queued = true; });
    expect(limiter.pending).toBe(1);
  });
});
