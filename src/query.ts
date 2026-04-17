import type { HttpClient } from "./http.js";
import type { EmitFn } from "./emitter.js";
import type {
  OntologyTree, QueryPayload, QueryResult,
  EntitySpec, QueryFilter, FilterOperator, SdkEvents,
} from "./types.js";

// ── EntityBuilder — fluent per-entity node ────────────────────────────────────

/**
 * Builds a single entity node within a query.
 * Chain filter methods then call `.done()` to return to the parent `QueryBuilder`.
 *
 * @example
 * const qb = anto.query.build("proj_abc");
 * qb.select("Customer", "c1")
 *   .properties("name", "email", "country")
 *   .eq("country", "USA")
 *   .gte("age", 18)
 *   .relatesTo("PURCHASED", "p1")
 * .done()
 */
export class EntityBuilder {
  private _spec: EntitySpec;
  private _parent: QueryBuilder;

  constructor(parent: QueryBuilder, alias: string, type: string) {
    this._parent = parent;
    this._spec   = { alias, type, properties: [], filters: [] };
  }

  /** Specify which properties to return (default: all). */
  properties(...props: string[]): this {
    this._spec.properties = props;
    return this;
  }

  /** Add a filter condition. */
  where(property: string, operator: FilterOperator, value: QueryFilter["value"]): this {
    this._spec.filters!.push({ property, operator, value });
    return this;
  }

  // ── Shorthand filter methods ─────────────────────────────────────────────

  /** property == value */
  eq(property: string, value: QueryFilter["value"]) { return this.where(property, "eq", value); }
  /** property != value */
  neq(property: string, value: QueryFilter["value"]) { return this.where(property, "neq", value); }
  /** property contains substring */
  contains(property: string, value: string) { return this.where(property, "contains", value); }
  /** property starts with prefix */
  startsWith(property: string, value: string) { return this.where(property, "starts_with", value); }
  /** property ends with suffix */
  endsWith(property: string, value: string) { return this.where(property, "ends_with", value); }
  /** property > value */
  gt(property: string, value: number) { return this.where(property, "gt", value); }
  /** property >= value */
  gte(property: string, value: number) { return this.where(property, "gte", value); }
  /** property < value */
  lt(property: string, value: number) { return this.where(property, "lt", value); }
  /** property <= value */
  lte(property: string, value: number) { return this.where(property, "lte", value); }

  /**
   * Join to another entity node via a named relationship.
   * `targetAlias` must match the alias of another `.select()` call on the parent builder.
   */
  relatesTo(relationshipType: string, targetAlias: string): this {
    this._spec.relationship = { type: relationshipType, target: targetAlias };
    return this;
  }

  /** Return to the parent `QueryBuilder` to add more entity nodes or run the query. */
  done(): QueryBuilder {
    return this._parent;
  }

  /** @internal */
  _build(): EntitySpec {
    return this._spec;
  }
}

// ── QueryBuilder ──────────────────────────────────────────────────────────────

/**
 * Fluent query builder. Create via `anto.query.build("project-id")`.
 *
 * @example
 * const result = await anto.query
 *   .build("proj_abc")
 *   .select("Customer", "c1")
 *     .properties("name", "email", "country")
 *     .eq("country", "USA")
 *     .gte("age", 18)
 *     .relatesTo("PURCHASED", "p1")
 *   .done()
 *   .select("Product", "p1")
 *     .properties("title", "price")
 *     .lte("price", 1000)
 *   .done()
 *   .orderBy("age", "desc")
 *   .limit(50)
 *   .run();
 */
export class QueryBuilder {
  private _projectId: string;
  private _entities:  EntityBuilder[]    = [];
  private _orderBy?:  QueryPayload["orderBy"];
  private _limit      = 50;
  private _name       = "";
  private _module:    QueryModule;

  constructor(projectId: string, module: QueryModule) {
    this._projectId = projectId;
    this._module    = module;
  }

  /**
   * Add an entity node to the query.
   * Returns an `EntityBuilder`. Call `.done()` to come back here.
   */
  select(type: string, alias?: string): EntityBuilder {
    const eb = new EntityBuilder(this, alias ?? `${type.toLowerCase()}${this._entities.length + 1}`, type);
    this._entities.push(eb);
    return eb;
  }

  /** Sort results by a property. */
  orderBy(property: string, direction: "asc" | "desc" = "asc"): this {
    this._orderBy = { property, direction };
    return this;
  }

  /** Maximum rows to return (max 1000). @default 50 */
  limit(n: number): this {
    this._limit = Math.min(n, 1000);
    return this;
  }

  /** Human-readable label shown in query history. */
  name(n: string): this {
    this._name = n;
    return this;
  }

  /** Serialize to the raw API payload without executing. */
  toJSON(): QueryPayload {
    return {
      entities: this._entities.map(e => e._build()),
      ...(this._orderBy ? { orderBy: this._orderBy } : {}),
      limit: this._limit,
      name: this._name,
    };
  }

  /** Execute the query and return results. */
  run(): Promise<QueryResult> {
    return this._module.execute(this._projectId, this.toJSON());
  }
}

// ── QueryModule ───────────────────────────────────────────────────────────────

export class QueryModule {
  constructor(
    private readonly http: HttpClient,
    private readonly emit: EmitFn<SdkEvents>,
  ) {}

  /**
   * Create a fluent query builder for a project.
   *
   * @example
   * const { rows } = await anto.query.build("proj_abc")
   *   .select("Customer").eq("country", "USA").done()
   *   .limit(20)
   *   .run();
   */
  build(projectId: string): QueryBuilder {
    return new QueryBuilder(projectId, this);
  }

  /**
   * Execute a raw JSON query payload.
   * Use this when you already have a query object (e.g. from the visual builder in the dashboard).
   *
   * @example
   * const result = await anto.query.execute("proj_abc", {
   *   entities: [{ alias: "c1", type: "Customer", filters: [{ property: "country", operator: "eq", value: "USA" }] }],
   *   limit: 10,
   * });
   */
  async execute(projectId: string, payload: QueryPayload): Promise<QueryResult> {
    const result = await this.http.post<QueryResult>(`/query/${projectId}/execute/`, payload);
    this.emit("query_executed", {
      project_id:    projectId,
      entity_types:  payload.entities.map(e => e.type),
      result_count:  result.total,
      execution_ms:  result.execution_ms,
    });
    return result;
  }

  /**
   * Fetch the ontology tree — entity types, their properties, and allowed relationships.
   * Use this to drive dynamic UI like the visual query builder.
   *
   * @example
   * const tree = await anto.query.ontology("proj_abc");
   * // { Customer: { properties: [...], relationships: [...] }, Product: { ... } }
   */
  async ontology(projectId: string): Promise<OntologyTree> {
    const res = await this.http.get<{ success: boolean; ontology: OntologyTree }>(
      `/query/${projectId}/ontology/`
    );
    return res.ontology;
  }

  /**
   * Get the recent query history for a project.
   */
  async history(projectId: string): Promise<QueryResult[]> {
    const res = await this.http.get<{ success: boolean; history: QueryResult[] }>(
      `/query/${projectId}/history/`
    );
    return res.history ?? [];
  }
}
