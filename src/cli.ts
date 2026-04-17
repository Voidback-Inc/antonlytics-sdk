#!/usr/bin/env node
/**
 * anto — Antonlytics CLI
 *
 * Usage: ANTO_API_KEY=anto_live_xxx anto <command> [args]
 *
 * Commands:
 *   projects                        List all projects
 *   stats       <project-id>        Graph statistics
 *   ontology    <project-id>        Print ontology schema
 *   ingest      <project-id> <file> Ingest triplets from JSON file
 *   query       <project-id> <file> Execute a JSON query file
 *   dashboard   <project-id>        Print dashboard summary
 *   poll        <event-id>          Poll an async ingestion event
 */
import { readFileSync } from "node:fs";
import { resolve }      from "node:path";
import { Antonlytics }  from "./client.js";
import { isAntoError }  from "./errors.js";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const apiKey  = process.env.ANTO_API_KEY ?? "";
const baseUrl = process.env.ANTO_BASE_URL;

if (!apiKey) {
  die("Set ANTO_API_KEY environment variable.\n  export ANTO_API_KEY=anto_live_xxx");
}

const anto = new Antonlytics({
  apiKey,
  ...(baseUrl ? { baseUrl } : {}),
  debug:   process.env.ANTO_DEBUG === "1",
  retries: 1,
});

if (process.env.ANTO_VERBOSE === "1") {
  anto.on("request",  ({ method, path }) => err(`→ ${dim(method)} ${path}`));
  anto.on("response", ({ status, path, ms }) => err(`← ${green(String(status))} ${path} ${dim(`${ms}ms`)}`));
  anto.on("retry",    ({ attempt, path }) => err(`⟳ retry ${attempt} ${path}`));
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

(async () => {
  try {
    switch (cmd) {
      case "projects":              await cmdProjects();                              break;
      case "stats":                 await cmdStats(need(args[0], "project-id"));      break;
      case "ontology":              await cmdOntology(need(args[0], "project-id"));   break;
      case "ingest":                await cmdIngest(need(args[0], "project-id"), need(args[1], "file")); break;
      case "query":                 await cmdQuery(need(args[0], "project-id"),  need(args[1], "file")); break;
      case "dashboard":             await cmdDashboard(need(args[0], "project-id")); break;
      case "poll":                  await cmdPoll(need(args[0], "event-id"));         break;
      default:                      help();
    }
  } catch (e) {
    if (isAntoError(e)) {
      die(`[${e.code}] ${e.message}${e.status ? ` (HTTP ${e.status})` : ""}`);
    }
    die(String(e));
  }
})();

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdProjects() {
  const projects = await anto.projects.list();
  hdr("PROJECTS");
  if (!projects.length) { log("  No projects found."); return; }
  for (const p of projects) {
    log(`  ${amber(p.id.slice(0, 8))}…  ${bold(p.name)}  ${dim(p.description || "")}`);
  }
}

async function cmdStats(projectId: string) {
  const s = await anto.projects.stats(projectId);
  hdr("GRAPH STATS");
  row("Entity types",         s.entity_types);
  row("Relationship types",   s.relationship_types);
  row("Total entities",       s.total_entities.toLocaleString());
  row("Total relationships",  s.total_relationships.toLocaleString());
}

async function cmdOntology(projectId: string) {
  const tree = await anto.query.ontology(projectId);
  hdr("ONTOLOGY");
  for (const [type, def] of Object.entries(tree)) {
    log(`\n  ${bold(amber(type))}`);
    log(`  ${"─".repeat(36)}`);
    if (def.properties.length) {
      log(`  ${dim("Properties")}`);
      for (const p of def.properties) {
        log(`    ${p.name.padEnd(22)} ${dim(p.type)}`);
      }
    }
    if (def.relationships.length) {
      log(`  ${dim("Relationships")}`);
      for (const r of def.relationships) {
        log(`    ${green(`─[${r.name}]→`)} ${r.target}`);
      }
    }
  }
}

async function cmdIngest(projectId: string, file: string) {
  const raw      = readFileSync(resolve(file), "utf-8");
  const triplets = JSON.parse(raw);
  const count    = Array.isArray(triplets) ? triplets.length : 1;

  hdr("INGEST");
  row("File",     file);
  row("Triplets", count);
  log("");

  const result = await anto.ingest.track(
    { projectId, triplets },
    { interval: 1_000, onStatus: e => err(`  polling… ${e.status}`) },
  );

  if ("results" in result && result.results) {
    const r = result.results;
    row("Entities created",      r.created_entities);
    row("Entities updated",      r.updated_entities);
    row("Relationships created", r.created_relationships);
    if (r.errors.length) {
      log(`\n  ${red(`Errors: ${r.errors.length}`)}`);
      r.errors.slice(0, 5).forEach(e => log(`    [${e.index}] ${e.error}`));
    }
  } else {
    row("Event ID", (result as any).id ?? "queued");
    row("Status",   (result as any).status ?? "done");
  }
}

async function cmdQuery(projectId: string, file: string) {
  const raw     = readFileSync(resolve(file), "utf-8");
  const payload = JSON.parse(raw);

  hdr("QUERY");
  const result = await anto.query.execute(projectId, payload);
  row("Total",        result.total);
  row("Execution",    `${result.execution_ms}ms`);
  log("");

  if (!result.rows.length) { log("  No results."); return; }

  const cols   = result.columns?.length
    ? result.columns
    : Object.keys(result.rows[0]).filter(k => !k.startsWith("_"));
  const widths = cols.map(c =>
    Math.min(28, Math.max(c.length, ...result.rows.slice(0, 30).map(r => String(r[c] ?? "").length)))
  );

  log("  " + bold(cols.map((c, i) => c.padEnd(widths[i])).join("  ")));
  log("  " + widths.map(w => "─".repeat(w)).join("  "));

  for (const r of result.rows.slice(0, 50)) {
    log("  " + cols.map((c, i) => String(r[c] ?? "").slice(0, widths[i]).padEnd(widths[i])).join("  "));
  }
  if (result.total > 50) log(`\n  ${dim(`…and ${result.total - 50} more rows`)}`);
}

async function cmdDashboard(projectId: string) {
  const m = await anto.dashboard.metrics(projectId);
  hdr(`DASHBOARD · ${m.project_name}`);

  log(`\n  ${dim("SUMMARY")}`);
  row("Events tracked",      m.summary.events_tracked.toLocaleString());
  row("Active entities",     m.summary.active_entities.toLocaleString());
  row("Total relationships", m.summary.total_relationships.toLocaleString());
  row("Query usage",         m.summary.query_usage.toLocaleString());

  if (m.top_ontology_queries.length) {
    log(`\n  ${dim("TOP QUERIES")}`);
    for (const q of m.top_ontology_queries.slice(0, 8)) {
      log(`    ${String(q.count).padStart(6)}  ${q.name}`);
    }
  }

  if (m.recent_events.length) {
    log(`\n  ${dim("RECENT EVENTS")}`);
    for (const e of m.recent_events) {
      const col = e.status === "done" ? green : e.status === "failed" ? red : amber;
      log(`    ${col(e.status.padEnd(12))}  ${e.triplets_count} triplets  ${dim(e.created_at)}`);
    }
  }
}

async function cmdPoll(eventId: string) {
  hdr(`POLLING · ${eventId}`);
  const event = await anto.ingest.poll(eventId, {
    interval: 1_500,
    timeout:  120_000,
    onStatus: e => log(`  ${dim(new Date().toISOString())}  ${amber(e.status)}`),
  });
  log("");
  row("Status",      event.status);
  row("Triplets",    event.triplets_count);
  row("Finished at", event.processed_at ?? "—");
}

// ── Help ──────────────────────────────────────────────────────────────────────

function help() {
  log(`
  ${bold("anto")} — Antonlytics CLI  ${dim("v1.0.0")}

  ${dim("Environment:")}
    ANTO_API_KEY    Your API key  ${dim("(required)")}
    ANTO_BASE_URL   API base URL  ${dim("(optional, default: https://api.antonlytics.com)")}
    ANTO_DEBUG=1    Log raw HTTP requests
    ANTO_VERBOSE=1  Log all lifecycle events

  ${dim("Commands:")}
    ${amber("projects")}                         List all projects
    ${amber("stats")}     ${dim("<project-id>")}           Graph statistics
    ${amber("ontology")}  ${dim("<project-id>")}           Print ontology schema
    ${amber("ingest")}    ${dim("<project-id> <file>")}    Ingest triplets JSON file
    ${amber("query")}     ${dim("<project-id> <file>")}    Execute a JSON query file
    ${amber("dashboard")} ${dim("<project-id>")}           Print dashboard summary
    ${amber("poll")}      ${dim("<event-id>")}             Poll async ingestion event

  ${dim("Examples:")}
    ANTO_API_KEY=anto_live_xxx anto projects
    ANTO_API_KEY=anto_live_xxx anto ingest proj_abc ./triplets.json
    ANTO_API_KEY=anto_live_xxx anto dashboard proj_abc
`);
}

// ── Formatting ────────────────────────────────────────────────────────────────

const T = process.stdout.isTTY;
const bold  = (s: string) => T ? `\x1b[1m${s}\x1b[0m`  : s;
const dim   = (s: string) => T ? `\x1b[2m${s}\x1b[0m`  : s;
const amber = (s: string) => T ? `\x1b[33m${s}\x1b[0m` : s;
const green = (s: string) => T ? `\x1b[32m${s}\x1b[0m` : s;
const red   = (s: string) => T ? `\x1b[31m${s}\x1b[0m` : s;

const log = (s = "")  => process.stdout.write(s + "\n");
const err = (s = "")  => process.stderr.write(s + "\n");
function hdr(title: string) { log(""); log(`  ${bold(title)}`); log(`  ${"═".repeat(Math.max(title.length, 36))}`); }
function row(label: string, value: unknown) { log(`  ${dim(label.padEnd(22))}  ${bold(String(value))}`); }
function need(v: string | undefined, name: string): string {
  if (!v) die(`Missing argument: <${name}>`);
  return v!;
}
function die(msg: string): never {
  err(`\n  ${red("✗")} ${msg}\n`);
  process.exit(1);
}
