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
   * Returns structured knowledge graph data.
   *
   * @param query - Optional natural language query to filter context
   * @returns Entities and relationships
   *
   * @example
   * ```typescript
   * // Get all memory
   * const memory = await agent.getMemory();
   *
   * // Use with your own model
   * const response = await yourModel.chat({
   *   system: "You are a sales assistant",
   *   context: memory,
   *   message: "Who to follow up?"
   * });
   * ```
   */
  async getMemory(query?: string): Promise<MemoryContext> {
    const response = await this.client.post<{ graph_context: MemoryContext }>('/api/v1/memory/query/', {
      question: query || 'What do you know?',
      project_id: this.projectId
    });

    return response.graph_context || { entities: [], relationships: [] };
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
