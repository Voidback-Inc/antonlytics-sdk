/**
 * examples/basic.ts
 *
 * Full working demonstration of the Antonlytics SDK.
 *
 * Run:
 *   ANTO_API_KEY=anto_live_xxx ANTO_PROJECT_ID=proj_abc npx ts-node examples/basic.ts
 */
import { Antonlytics, isAntoError } from "../src/index.js";

const PROJECT_ID = process.env.ANTO_PROJECT_ID ?? "YOUR_PROJECT_ID";

const anto = new Antonlytics({
  apiKey:  process.env.ANTO_API_KEY ?? "anto_live_xxx",
  baseUrl: process.env.ANTO_BASE_URL ?? "http://localhost:8000",
  debug:   false,

  // Optional: client-side rate limiting
  rateLimit: { maxRequests: 100, windowMs: 60_000 },
});

// ── Lifecycle observers ───────────────────────────────────────────────────────

anto.on("request",  ({ method, path }) =>
  console.log(`\x1b[36m→ ${method} ${path}\x1b[0m`));

anto.on("response", ({ status, path, ms }) =>
  console.log(`\x1b[32m← ${status} ${path} (${ms}ms)\x1b[0m`));

anto.on("error", ({ error }) =>
  console.error(`\x1b[31m✗ [${error.code}] ${error.message}\x1b[0m`));

anto.on("ingest_done", ({ event_id, triplets_count }) =>
  console.log(`  ✓ Ingested ${triplets_count} triplets (event: ${event_id})`));

anto.on("query_executed", ({ entity_types, result_count, execution_ms }) =>
  console.log(`  ✓ Query [${entity_types.join(", ")}] → ${result_count} rows in ${execution_ms}ms`));

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. List projects
  console.log("\n━━━ 1. Projects ━━━");
  const projects = await anto.projects.list();
  console.log(`  Found ${projects.length} project(s)`);
  projects.forEach(p => console.log(`  • ${p.id}  ${p.name}`));

  // 2. Ingest triplets (sync — ≤100)
  console.log("\n━━━ 2. Ingest Triplets ━━━");
  const ingestResult = await anto.ingest.track({
    projectId: PROJECT_ID,
    triplets: [
      {
        subject:  { type: "Customer", id: "cust_1", properties: { name: "Alice Johnson", country: "USA", age: 32 } },
        predicate: "PURCHASED",
        object:   { type: "Product",  id: "prod_1", properties: { title: "Laptop Pro", price: 1299, category: "Electronics" } },
        relationship_properties: { quantity: 1, date: "2026-04-15" },
      },
      {
        subject:  { type: "Customer", id: "cust_2", properties: { name: "Bob Smith", country: "UK", age: 27 } },
        predicate: "PURCHASED",
        object:   { type: "Product",  id: "prod_2", properties: { title: "Smartphone X", price: 799, category: "Mobile" } },
      },
      {
        subject:  { type: "Product", id: "prod_1" },
        predicate: "BELONGS_TO",
        object:   { type: "Category", id: "cat_tech", properties: { name: "Technology", slug: "technology" } },
      },
    ],
  });
  console.log("  Result:", JSON.stringify(ingestResult, null, 2));

  // 3. Fetch ontology
  console.log("\n━━━ 3. Ontology Tree ━━━");
  const ontology = await anto.query.ontology(PROJECT_ID);
  for (const [type, def] of Object.entries(ontology)) {
    const props = def.properties.map(p => p.name).join(", ");
    const rels  = def.relationships.map(r => `${r.name}→${r.target}`).join(", ");
    console.log(`  ${type.padEnd(16)} props: [${props}]${rels ? `  rels: [${rels}]` : ""}`);
  }

  // 4. Fluent query
  console.log("\n━━━ 4. Fluent Query ━━━");
  const result = await anto.query
    .build(PROJECT_ID)
    .select("Customer", "c1")
      .properties("name", "email", "country", "age")
      .eq("country", "USA")
      .gte("age", 18)
    .done()
    .orderBy("age", "desc")
    .limit(10)
    .name("US adult customers")
    .run();

  console.log(`  ${result.total} rows in ${result.execution_ms}ms`);
  result.rows.slice(0, 5).forEach((r, i) => console.log(`  [${i + 1}]`, r));

  // 5. Multi-entity join query
  console.log("\n━━━ 5. Join Query (Customer→Product) ━━━");
  const joinResult = await anto.query
    .build(PROJECT_ID)
    .select("Customer", "c1")
      .properties("name", "country")
      .relatesTo("PURCHASED", "p1")
    .done()
    .select("Product", "p1")
      .properties("title", "price")
      .lte("price", 1000)
    .done()
    .limit(5)
    .run();

  console.log(`  ${joinResult.total} rows`);
  joinResult.rows.forEach(r => console.log("  ", r));

  // 6. Dashboard metrics
  console.log("\n━━━ 6. Dashboard Metrics ━━━");
  const metrics = await anto.dashboard.metrics(PROJECT_ID);
  console.log("  Summary:", metrics.summary);
  console.log("  Entity distribution:", metrics.charts.entity_distribution.data);
  console.log("  Recent events:", metrics.recent_events.slice(0, 3).map(e => `${e.status}(${e.triplets_count})`));

  // 7. Batch ingest (large dataset)
  console.log("\n━━━ 7. Batch Ingest (50 triplets, chunks of 20) ━━━");
  const bigBatch = Array.from({ length: 50 }, (_, i) => ({
    subject:  { type: "Customer", id: `batch_${i}`, properties: { name: `User ${i}`, country: i % 2 === 0 ? "USA" : "UK" } },
    predicate: "VIEWED",
    object:   { type: "Page", id: `page_${i % 10}`, properties: { url: `/product/${i % 10}` } },
  }));

  await anto.ingest.batch({
    projectId: PROJECT_ID,
    triplets:  bigBatch,
    chunkSize: 20,
    onChunk: (i, total) => console.log(`  Chunk ${i}/${total} sent`),
  });

  // 8. Graph stats
  console.log("\n━━━ 8. Graph Stats ━━━");
  const stats = await anto.projects.stats(PROJECT_ID);
  console.log("  Stats:", stats);

  console.log("\n✓ All examples completed.\n");
}

main().catch(err => {
  if (isAntoError(err)) {
    console.error(`\nAntoError [${err.code}] HTTP ${err.status}: ${err.message}`);
    if (err.code === "PLAN_LIMIT_REACHED") {
      console.error("  → Upgrade at app.antonlytics.com/billing");
    }
    if (err.details) console.error("  Details:", JSON.stringify(err.details, null, 2));
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
});
