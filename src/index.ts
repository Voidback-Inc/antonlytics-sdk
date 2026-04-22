/**
 * Antonlytics JavaScript/TypeScript SDK - Memory for AI Agents
 *
 * Simple SDK for giving your AI agent persistent memory.
 *
 * @packageDocumentation
 */

export { Agent } from './agent';
export type {
  AgentConfig,
  IngestResponse,
  ChatResponse,
  MemoryContext,
  Message
} from './agent';
export { AntonlyticsError, APIError, AuthenticationError } from './exceptions';

/**
 * Quick agent setup helper function.
 *
 * @param apiKey - Your API key
 * @param projectId - Your project ID
 * @returns Agent instance
 *
 * @example
 * ```typescript
 * import { createAgent } from 'antonlytics';
 *
 * const agent = createAgent('your-api-key', 'project-id');
 * await agent.chat("Who should I follow up with?");
 * ```
 */
export function createAgent(apiKey: string, projectId: string) {
  const { Agent } = require('./agent');
  return new Agent({ apiKey, projectId });
}

// Default export for convenience
export { Agent as default } from './agent';
