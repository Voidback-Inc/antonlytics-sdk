# @antonlytics/sdk

Official JavaScript / TypeScript SDK for the [Antonlytics](https://antonlytics.com) Knowledge Graph API.

[![npm](https://img.shields.io/npm/v/@antonlytics/sdk)](https://www.npmjs.com/package/@antonlytics/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## Install

```bash
npm install @antonlytics/sdk
```

> **Node 18+** recommended (native `fetch`). For older Node, pass a `fetch` polyfill via `config.fetch`.

---

## Quick Start

```ts
import { Antonlytics } from "@antonlytics/sdk";

const anto = new Antonlytics({
  apiKey: process.env.ANTONLYTICS_API_KEY!, // anto_live_...
});

// Ingest a relationship
await anto.ingest.track({
  projectId: "proj_abc",
  triplets: {
    subject:  { type: "Customer", id: "cust_1", properties: { name: "Alice", country: "USA" } },
    predicate: "PURCHASED",
    object:   { type: "Product",  id: "prod_5", properties: { title: "Laptop Pro", price: 999 } },
  },
});

// Query the graph
const { rows } = await anto.query
  .build("proj_abc")
  .select("Customer", "c1")
    .properties("name", "email", "country")
    .eq("country", "USA")
    .gte("age", 18)
  .done()
  .orderBy("age", "desc")
  .limit(50)
  .run();
```

---

## Configuration

```ts
const anto = new Antonlytics({
  apiKey:    "anto_live_...",                     // required — from app.antonlytics.com → API Keys
  baseUrl:   "https://api.antonlytics.com",       // optional, default shown
  timeout:   30_000,                              // ms, default 30s
  retries:   2,                                   // auto-retry on 5xx/network errors
  debug:     false,                               // log requests to console
  fetch:     customFetch,                         // custom fetch (Node 16, test mocks, edge runtimes)
  rateLimit: { maxRequests: 100, windowMs: 60_000 }, // optional client-side throttle
});
```

**API key validation** — keys must start with `anto_live_`. The constructor throws `INVALID_API_KEY` immediately if the format is wrong, so misconfiguration is caught at startup, not at runtime.

---

## Ingestion

All data enters the knowledge graph through the SDK as **triplets**: `(subject) –[predicate]→ (object)`.

### `anto.ingest.track(options, pollOptions?)` ← recommended

Ingest and automatically poll if the job is async. Handles both sync and async transparently.

```ts
const result = await anto.ingest.track(
  {
    projectId: "proj_abc",
    triplets: [
      {
        subject:   { type: "Customer", id: "cust_1", properties: { name: "Alice", country: "USA" } },
        predicate: "PURCHASED",
        object:    { type: "Product",  id: "prod_5", properties: { title: "Laptop Pro", price: 999 } },
        relationship_properties: { quantity: 2, date: "2026-04-15" },
      },
    ],
  },
  {
    interval:  1_000,          // poll every 1s for async batches
    timeout:   60_000,         // give up after 60s
    onStatus: (e) => console.log("Status:", e.status),
  }
);
```

Batches **≤ 100** triplets → processed synchronously, returns full results immediately.
Batches **> 100** → queued for background processing, auto-polled until `done`.

### `anto.ingest.send(options)` — fire and forget

```ts
const result = await anto.ingest.send({ projectId, triplets });
if (result.async) {
  // poll manually
  const event = await anto.ingest.poll(result.event_id, { onStatus: console.log });
}
```

### `anto.ingest.batch(options)` — large datasets

```ts
await anto.ingest.batch({
  projectId: "proj_abc",
  triplets:  thousandsOfTriplets,
  chunkSize: 200,
  onChunk: (i, total, result) => console.log(`Chunk ${i}/${total}`),
});
```

### `anto.ingest.status(eventId)` / `anto.ingest.history(projectId)`

```ts
const event = await anto.ingest.status("event-id");
const history = await anto.ingest.history("proj_abc");
```

---

## Query Builder

### Fluent API

```ts
const result = await anto.query
  .build("proj_abc")

  // First entity node
  .select("Customer", "c1")
    .properties("name", "email", "country", "age")
    .eq("country", "USA")
    .gte("age", 21)
    .relatesTo("PURCHASED", "p1")   // join to product1 node below
  .done()

  // Second entity node (joined via PURCHASED relationship)
  .select("Product", "p1")
    .properties("title", "price", "category")
    .lte("price", 500)
  .done()

  .orderBy("age", "desc")
  .limit(100)
  .name("US adult customers buying affordable products")
  .run();

console.log(result.rows);      // typed rows
console.log(result.total);     // total result count
console.log(result.execution_ms);
```

**Filter operators:** `eq` · `neq` · `contains` · `startsWith` · `endsWith` · `gt` · `gte` · `lt` · `lte`

### Raw payload

```ts
const result = await anto.query.execute("proj_abc", {
  entities: [{ alias: "c1", type: "Customer", filters: [{ property: "country", operator: "eq", value: "USA" }] }],
  limit: 10,
});
```

### Ontology tree

```ts
const tree = await anto.query.ontology("proj_abc");
// {
//   Customer: {
//     properties: [{ name: "name", type: "str" }, ...],
//     relationships: [{ name: "PURCHASED", target: "Product" }]
//   }
// }
```

---

## Dashboard

```ts
const { summary, charts, top_ontology_queries, recent_events } =
  await anto.dashboard.metrics("proj_abc");

summary.events_tracked        // number
summary.active_entities       // number
summary.total_relationships   // number
summary.query_usage           // number

charts.event_volume.data        // [{ date, count }]       — scatter
charts.entity_distribution.data // [{ name, value }]       — pie
charts.relationship_growth.data // [{ date, new, cumulative }] — histogram
```

---

## Projects

```ts
const projects = await anto.projects.list();
const project  = await anto.projects.get("proj_abc");
const created  = await anto.projects.create({ name: "My Graph", teamId: "team-uuid" });
const stats    = await anto.projects.stats("proj_abc");
const ontology = await anto.projects.ontology("proj_abc");
```

---

## Error Handling

All methods throw `AntoError` on failure.

```ts
import { isAntoError } from "@antonlytics/sdk";

try {
  await anto.ingest.track({ ... });
} catch (err) {
  if (isAntoError(err)) {
    console.error(err.code);    // "PLAN_LIMIT_REACHED", "UNAUTHORIZED", "NOT_FOUND" …
    console.error(err.status);  // 402, 401, 404, 0 (network/timeout) …
    console.error(err.message); // human-readable
    console.error(err.details); // raw server payload

    if (err.code === "PLAN_LIMIT_REACHED") {
      // Redirect user to upgrade: app.antonlytics.com/billing
    }
    if (err.code === "UNAUTHORIZED") {
      // API key is invalid or revoked
    }
  }
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_CONFIG`   | 0   | Missing or empty `apiKey` |
| `INVALID_API_KEY`  | 0   | Key doesn't start with `anto_live_` |
| `MISSING_FETCH`    | 0   | `fetch` not available in runtime |
| `UNAUTHORIZED`     | 401 | API key invalid or revoked |
| `FORBIDDEN`        | 403 | Key lacks permission for this resource |
| `NOT_FOUND`        | 404 | Project, event, or entity not found |
| `PLAN_LIMIT_REACHED` | 402 | Event quota exhausted for your plan |
| `API_KEY_LIMIT_REACHED` | 402 | Too many API keys for your plan |
| `RATE_LIMITED`     | 429 | Too many requests |
| `SERVER_ERROR`     | 500 | Backend error |
| `INGESTION_FAILED` | 500 | Async ingestion job failed |
| `POLL_TIMEOUT`     | 0   | Async job didn't finish within timeout |
| `NETWORK_ERROR`    | 0   | Network failure |
| `TIMEOUT`          | 0   | Request exceeded `config.timeout` |

---

## Lifecycle Events

```ts
anto.on("request",     ({ method, path, body }) => { /* before every request */ });
anto.on("response",    ({ method, path, status, ms }) => { /* after success */ });
anto.on("retry",       ({ method, path, attempt, error }) => { /* on auto-retry */ });
anto.on("error",       ({ method, path, error }) => { /* after all retries fail */ });
anto.on("ingest_queued",  ({ event_id, triplets_count }) => { /* job submitted */ });
anto.on("ingest_done",    ({ event_id, triplets_count, results }) => { /* job done */ });
anto.on("ingest_failed",  ({ event_id, error }) => { /* job failed */ });
anto.on("query_executed", ({ project_id, entity_types, result_count, execution_ms }) => { });
anto.on("plan_limit_hit", ({ used, limit }) => { /* redirect to /billing */ });

// Unsubscribe
const unsub = anto.on("error", handler);
unsub(); // remove this listener

// Subscribe once
anto.once("ingest_done", handler);
```

---

## CLI

```bash
# Install globally
npm install -g @antonlytics/sdk

# Or use npx
ANTO_API_KEY=anto_live_xxx npx @antonlytics/sdk projects

# Commands
anto projects
anto stats      <project-id>
anto ontology   <project-id>
anto ingest     <project-id> ./triplets.json
anto query      <project-id> ./query.json
anto dashboard  <project-id>
anto poll       <event-id>

# Environment
ANTO_API_KEY=anto_live_xxx   # required
ANTO_BASE_URL=http://...     # optional, self-hosted
ANTO_DEBUG=1                 # log raw HTTP
ANTO_VERBOSE=1               # log lifecycle events
```

---

## Next.js Integration

```ts
// lib/anto.ts — server-side singleton
import { Antonlytics } from "@antonlytics/sdk";

export const anto = new Antonlytics({
  apiKey: process.env.ANTONLYTICS_API_KEY!,
});

// app/api/ingest/route.ts
import { anto } from "@/lib/anto";
import { NextRequest, NextResponse } from "next/server";
import { isAntoError } from "@antonlytics/sdk";

export async function POST(req: NextRequest) {
  try {
    const { projectId, triplets } = await req.json();
    const result = await anto.ingest.track({ projectId, triplets });
    return NextResponse.json(result);
  } catch (err) {
    if (isAntoError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status || 500 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

---

## Development

```bash
npm install
npm run build       # CJS + ESM + TypeScript declarations
npm test            # Vitest
npm run test:watch
npm run lint        # tsc --noEmit
```

---

## License

MIT © Antonlytics
