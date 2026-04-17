import type { HttpClient } from "./http.js";
import type {
  Project, CreateProjectOptions, GraphStats,
  OntologyTree, DashboardMetrics,
} from "./types.js";

// ── Projects ──────────────────────────────────────────────────────────────────

export class ProjectsModule {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all projects accessible to this API key.
   *
   * @example
   * const projects = await anto.projects.list();
   * console.log(projects[0].id); // use as projectId in other calls
   */
  async list(): Promise<Project[]> {
    const res = await this.http.get<{ results?: Project[] } | Project[]>("/graph/projects/");
    return Array.isArray(res) ? res : (res as any).results ?? [];
  }

  /**
   * Fetch a single project by ID.
   */
  async get(projectId: string): Promise<Project> {
    return this.http.get<Project>(`/graph/projects/${projectId}/`);
  }

  /**
   * Create a new project.
   *
   * @example
   * const project = await anto.projects.create({
   *   name: "E-Commerce Graph",
   *   teamId: "team-uuid",
   * });
   */
  async create(options: CreateProjectOptions): Promise<Project> {
    return this.http.post<Project>("/graph/projects/", {
      name:        options.name,
      description: options.description ?? "",
      team_id:     options.teamId,
    });
  }

  /**
   * Get graph statistics for a project (entity counts, relationship counts).
   *
   * @example
   * const stats = await anto.projects.stats("proj_abc");
   * console.log(stats.total_entities, stats.total_relationships);
   */
  async stats(projectId: string): Promise<GraphStats> {
    const res = await this.http.get<{ success: boolean; stats: GraphStats }>(
      `/graph/projects/${projectId}/stats/`
    );
    return res.stats;
  }

  /**
   * Fetch the full ontology tree for a project.
   * Equivalent to `anto.query.ontology(projectId)`.
   */
  async ontology(projectId: string): Promise<OntologyTree> {
    const res = await this.http.get<{ success: boolean; ontology: OntologyTree }>(
      `/graph/projects/${projectId}/ontology/`
    );
    return res.ontology;
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export class DashboardModule {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch all dashboard metrics for a project in a single call.
   * Returns summary counts plus chart-ready datasets.
   *
   * @example
   * const { summary, charts, recent_events } = await anto.dashboard.metrics("proj_abc");
   *
   * // summary.active_entities, .total_relationships, .events_tracked, .query_usage
   * // charts.event_volume.data        → scatter: [{ date, count }]
   * // charts.entity_distribution.data → pie:     [{ name, value }]
   * // charts.relationship_growth.data → histogram: [{ date, new, cumulative }]
   */
  async metrics(projectId: string): Promise<DashboardMetrics> {
    return this.http.get<DashboardMetrics>(`/dashboard/${projectId}/metrics/`);
  }
}
