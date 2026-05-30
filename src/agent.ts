/**
 * Agent class for interacting with Antonlytics API.
 */

import { HTTPClient } from './http-client';
import { AntonlyticsError } from './exceptions';

export interface AgentConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
}

export interface IngestResponse {
  extracted: {
    entities: Array<{
      name: string;
      type: string;
      properties?: Record<string, any>;
    }>;
    relationships: Array<{
      from: string;
      to: string;
      type: string;
      properties?: Record<string, any>;
    }>;
  };
  created: {
    entities: number;
    relationships: number;
  };
}

export interface ChatResponse {
  response: string;
  relevant_entities: Array<{
    id: string;
    name: string;
    type: string;
    properties?: Record<string, any>;
  }>;
}

export interface MemoryContext {
  entities: Array<{
    id: string;
    name: string;
    type: string;
    properties?: Record<string, any>;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    properties?: Record<string, any>;
  }>;
}

export interface MemoryListPage {
  entities: MemoryContext['entities'];
  relationships: MemoryContext['relationships'];
  next_cursor: string | null;
  has_more: boolean;
}

export interface Message {
  role: string;
  content: string;
}

/**
 * Antonlytics Agent - Give your AI agent memory.
 *
 * @example
 * ```typescript
 * import { Agent } from 'antonlytics';
 *
 * const agent = new Agent({
 *   apiKey: 'your-api-key',
 *   projectId: 'your-project-id'
 * });
 *
 * // Ingest data - agent learns
 * await agent.ingest("Had a call with Sarah from TechCorp about Enterprise plan");
 *
 * // Chat with agent - agent remembers
 * const response = await agent.chat("Who should I follow up with?");
 * console.log(response.response);
 * ```
 */
export class Agent {
  private apiKey: string;
  private projectId: string;
  private baseUrl: string;
  private client: HTTPClient;

  /**
   * Initialize Antonlytics Agent.
   *
   * @param config - Agent configuration
   */
  constructor(config: AgentConfig) {
    if (!config.apiKey) {
      throw new AntonlyticsError('API key is required');
    }
    if (!config.projectId) {
      throw new AntonlyticsError('Project ID is required');
    }

    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
    this.baseUrl = (config.baseUrl || 'https://api.antonlytics.com').replace(/\/$/, '');
    this.client = new HTTPClient(this.apiKey, this.baseUrl);
  }

  /**
   * Ingest text and extract entities/relationships.
   * Your agent learns from this text.
   *
   * @param text - Natural language text (conversations, notes, emails)
   * @returns Extracted entities and relationships
   *
   * @example
   * ```typescript
   * const result = await agent.ingest(`
   *   Had a meeting with Alice Johnson from DataCorp today.
   *   She's interested in our Pro plan for 20 engineers.
   *   Follow up next Tuesday.
   * `);
   *
   * console.log(result.created);
   * // => {entities: 2, relationships: 1}
   * ```
   */
  async ingest(text: string): Promise<IngestResponse> {
    if (!text || !text.trim()) {
      throw new AntonlyticsError('Text cannot be empty');
    }

    return this.client.post<IngestResponse>('/api/v1/memory/extract/', {
      text: text.trim(),
      project_id: this.projectId
    });
  }

  /**
   * Ingest pre-formed triplets directly — bypasses Claude extraction.
   *
   * Use this from SaaS applications when your code already knows the
   * structured data (DB rows, parsed events, etc.) and you don't want to
   * pay LLM extraction cost / latency.
   *
   * Each triplet is `{subject, predicate, object, relationship_properties?}`.
   * Batches over 100 are processed asynchronously; poll
   * `agent.ingestionEventStatus(eventId)` if `async: true`.
   *
   * @example
   * ```typescript
   * await agent.ingestTriplets([
   *   {
   *     subject:   { type: "Customer", id: "cust_42", properties: { name: "Acme" }},
   *     predicate: "PURCHASED",
   *     object:    { type: "Product",  id: "prod_7",  properties: { sku: "P-7" }},
   *   },
   * ]);
   * ```
   */
  async ingestTriplets(triplets: Array<Record<string, any>>): Promise<{
    success: boolean; event_id: string; async: boolean; results?: any; message?: string;
  }> {
    if (!triplets?.length) throw new AntonlyticsError('triplets must be a non-empty array');
    return this.client.post('/api/v1/ingest/', {
      project_id: this.projectId,
      triplets,
    });
  }

  /** Convenience: upsert a single entity (no relationship). */
  async upsertEntity(type: string, externalId: string,
                     properties: Record<string, any> = {}): Promise<any> {
    return this.ingestTriplets([{
      subject:   { type, id: externalId, properties },
      predicate: 'SELF',
      object:    { type, id: externalId, properties },
    }]);
  }

  /** Convenience: post a single source --[predicate]--> target edge. */
  async addRelationship(
    source: { type: string; id: string; properties?: Record<string, any> },
    predicate: string,
    target: { type: string; id: string; properties?: Record<string, any> },
    relationshipProperties: Record<string, any> = {},
  ): Promise<any> {
    return this.ingestTriplets([{
      subject:   source,
      predicate,
      object:    target,
      relationship_properties: relationshipProperties,
    }]);
  }

  /** Poll an async ingestion event's status (returned from large batches). */
  async ingestionEventStatus(eventId: string): Promise<any> {
    return this.client.get(`/api/v1/ingest/events/${eventId}/`);
  }

  /**
   * Chat with your agent. Agent has full memory context.
   * Uses your system prompt + memory from knowledge graph.
   *
   * @param message - Your question or message
   * @param history - Optional conversation history
   * @returns Agent's response and relevant entities
   *
   * @example
   * ```typescript
   * const response = await agent.chat("Who should I follow up with?");
   * console.log(response.response);
   * // => "You should follow up with Alice from DataCorp..."
   *
   * // Access relevant entities
   * response.relevant_entities.forEach(entity => {
   *   console.log(`${entity.name} - ${entity.type}`);
   * });
   * ```
   */
  async chat(message: string, history?: Message[]): Promise<ChatResponse> {
    if (!message || !message.trim()) {
      throw new AntonlyticsError('Message cannot be empty');
    }

    const payload: any = {
      message: message.trim(),
      project_id: this.projectId
    };

    if (history) {
      payload.history = history;
    }

    return this.client.post<ChatResponse>('/api/v1/memory/chat/', payload);
  }

  /**
   * Get memory context for your own agent/model.
   *
   * Two modes:
   * - With `query`: semantic top-K retrieval (single shot, server-ranked).
   *   Returns the most relevant entities and their relationships.
   * - Without `query`: enumerates the full project graph via cursor pagination,
   *   auto-iterating pages internally. Stops at `maxEntities` for safety.
   *
   * @param query - Optional natural language query for ranked retrieval.
   * @param options.maxEntities - Safety ceiling for full-graph mode (default 10000).
   * @param options.pageSize - Pagination page size for full-graph mode (1-1000, default 500).
   * @returns Entities and relationships.
   *
   * @example
   * ```typescript
   * // Top-K retrieval for prompt context
   * const memory = await agent.getMemory("What did Sarah say?");
   *
   * // Full project dump (auto-paginated)
   * const all = await agent.getMemory();
   *
   * // For very large projects, stream pages:
   * for await (const page of agent.iterMemory({ pageSize: 500 })) {
   *   process(page);
   * }
   * ```
   */
  async getMemory(
    query?: string,
    options: { maxEntities?: number; pageSize?: number } = {}
  ): Promise<MemoryContext> {
    if (query) {
      const response = await this.client.post<{ graph_context: MemoryContext }>(
        '/api/v1/memory/query/',
        { question: query, project_id: this.projectId }
      );
      return response.graph_context || { entities: [], relationships: [] };
    }

    const maxEntities = options.maxEntities ?? 10_000;
    const pageSize    = options.pageSize ?? 500;

    const entities: MemoryContext['entities'] = [];
    const relationships: MemoryContext['relationships'] = [];
    for await (const page of this.iterMemory({ pageSize })) {
      entities.push(...(page.entities || []));
      relationships.push(...(page.relationships || []));
      if (entities.length >= maxEntities) {
        entities.length = maxEntities;
        break;
      }
    }
    return { entities, relationships };
  }

  /**
   * Stream the full project graph one page at a time.
   *
   * Yields a page object `{ entities, relationships, next_cursor, has_more }`
   * per iteration. Iteration stops automatically when the server reports no
   * more pages.
   *
   * @param options.pageSize - Rows per page (1-1000, default 500).
   *
   * @example
   * ```typescript
   * for await (const page of agent.iterMemory({ pageSize: 200 })) {
   *   for (const e of page.entities) console.log(e.name);
   * }
   * ```
   */
  async *iterMemory(
    options: { pageSize?: number } = {}
  ): AsyncIterableIterator<MemoryListPage> {
    const pageSize = options.pageSize ?? 500;
    let cursor: string | null = null;
    while (true) {
      const payload: Record<string, unknown> = {
        project_id: this.projectId,
        limit: pageSize,
      };
      if (cursor) payload.cursor = cursor;
      const page = await this.client.post<MemoryListPage>('/api/v1/memory/list/', payload);
      yield page;
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
  }

  /**
   * Set the system prompt for your agent.
   * Defines agent behavior and personality.
   *
   * @param prompt - System prompt text
   * @returns Updated system prompt
   *
   * @example
   * ```typescript
   * await agent.setSystemPrompt(`
   *   You are a helpful sales assistant.
   *   Be concise and action-oriented.
   *   Focus on follow-ups and next steps.
   * `);
   * ```
   */
  async setSystemPrompt(prompt: string): Promise<{ system_prompt: string }> {
    if (!prompt || !prompt.trim()) {
      throw new AntonlyticsError('System prompt cannot be empty');
    }

    return this.client.patch<{ system_prompt: string }>(
      `/api/v1/memory/system-prompt/${this.projectId}/`,
      { system_prompt: prompt.trim() }
    );
  }

  /**
   * Get current system prompt.
   *
   * @returns System prompt text
   */
  async getSystemPrompt(): Promise<string> {
    const response = await this.client.get<{ system_prompt: string }>(
      `/api/v1/memory/system-prompt/${this.projectId}/`
    );
    return response.system_prompt || '';
  }
}
