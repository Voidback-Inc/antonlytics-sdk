/**
 * Account-level client. Use this for project CRUD when one API key manages
 * many projects (typical SaaS app pattern).
 *
 * @example
 * ```typescript
 * import { Antonlytics } from 'antonlytics';
 *
 * const client = new Antonlytics({ apiKey: '...' });
 * const project = await client.createProject({ name: 'customer_42' });
 *
 * const agent = client.agent(project.id);
 * await agent.ingestTriplets([...]);
 * ```
 */
import { HTTPClient } from './http-client';
import { Agent } from './agent';
import { AntonlyticsError } from './exceptions';

export interface AntonlyticsConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  scope?: string;
  description?: string;
  team_id?: string;
  created_at?: string;
}

export class Antonlytics {
  private apiKey: string;
  private baseUrl: string;
  private client: HTTPClient;

  constructor(config: AntonlyticsConfig) {
    if (!config.apiKey) throw new AntonlyticsError('API key is required');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.antonlytics.com').replace(/\/$/, '');
    this.client = new HTTPClient(this.apiKey, this.baseUrl);
  }

  // ── Project CRUD ──────────────────────────────────────────────────────

  async listProjects(): Promise<Project[]> {
    const r = await this.client.get<any>('/api/v1/graph/projects/');
    return r?.results ?? r ?? [];
  }

  async createProject(opts: { name: string; scope?: string; description?: string }): Promise<Project> {
    if (!opts.name?.trim()) throw new AntonlyticsError('Project name is required');
    return this.client.post<Project>('/api/v1/graph/projects/', {
      name: opts.name.trim(),
      ...(opts.scope ? { scope: opts.scope } : {}),
      ...(opts.description ? { description: opts.description } : {}),
    });
  }

  async getProject(projectId: string): Promise<Project> {
    return this.client.get<Project>(`/api/v1/graph/projects/${projectId}/`);
  }

  async deleteProject(projectId: string): Promise<any> {
    return this.client.delete(`/api/v1/graph/projects/${projectId}/`);
  }

  async projectStats(projectId: string): Promise<any> {
    return this.client.get(`/api/v1/graph/projects/${projectId}/stats/`);
  }

  async projectOntology(projectId: string): Promise<any> {
    return this.client.get(`/api/v1/graph/projects/${projectId}/ontology/`);
  }

  // ── Agent factory ─────────────────────────────────────────────────────

  /** Return an Agent scoped to `projectId`. Reuses this client's API key. */
  agent(projectId: string): Agent {
    return new Agent({ apiKey: this.apiKey, projectId, baseUrl: this.baseUrl });
  }
}
