/**
 * LangChain memory adapter.
 *
 * Usage:
 * ```ts
 * import { Agent } from 'antonlytics';
 * import { AntonlyticsMemory } from 'antonlytics/integrations/langchain';
 *
 * const agent  = new Agent({ apiKey: '...', projectId: '...' });
 * const memory = new AntonlyticsMemory({ agent });
 * // drop into any LangChain chain
 * ```
 *
 * Requires @langchain/core as a peer dependency:
 *     npm install @langchain/core
 */
import { BaseMemory, InputValues, MemoryVariables, OutputValues } from '@langchain/core/memory';

import { Agent, MemoryContext } from '../agent';

function formatGraph(graph: MemoryContext | undefined): string {
  if (!graph) return '';
  const entities = graph.entities || [];
  const relationships = graph.relationships || [];
  if (entities.length === 0 && relationships.length === 0) return '';

  const lines: string[] = [];
  if (entities.length > 0) {
    lines.push('Known facts:');
    for (const e of entities.slice(0, 50)) {
      const props = e.properties || {};
      const name = (props as any).name || e.name || e.id || '';
      const extras = Object.entries(props)
        .filter(([k]) => k !== 'name')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      lines.push(`- [${e.type || '?'}] ${name}${extras ? ` — ${extras}` : ''}`);
    }
  }

  if (relationships.length > 0) {
    const idToName = new Map<string, string>();
    for (const e of entities) {
      const props = e.properties || {};
      idToName.set(e.id, (props as any).name || e.name || e.id);
    }
    lines.push('Relationships:');
    for (const r of relationships.slice(0, 50)) {
      const src = idToName.get(r.from) || r.from;
      const tgt = idToName.get(r.to) || r.to;
      lines.push(`- ${src} --[${r.type || '?'}]--> ${tgt}`);
    }
  }

  return lines.join('\n');
}

export interface AntonlyticsMemoryConfig {
  agent: Agent;
  memoryKey?: string;
  inputKey?: string;
  outputKey?: string;
}

/**
 * LangChain BaseMemory backed by an Antonlytics project.
 *
 * `loadMemoryVariables` fetches a question-scoped slice of the knowledge
 * graph and formats it into a string suitable for a prompt.
 * `saveContext` ingests the new turn so the next call sees it.
 */
export class AntonlyticsMemory extends BaseMemory {
  private agent: Agent;
  private memoryKey: string;
  private inputKey: string;
  private outputKey?: string;

  constructor(config: AntonlyticsMemoryConfig) {
    super();
    this.agent = config.agent;
    this.memoryKey = config.memoryKey || 'history';
    this.inputKey = config.inputKey || 'input';
    this.outputKey = config.outputKey;
  }

  get memoryKeys(): string[] {
    return [this.memoryKey];
  }

  async loadMemoryVariables(values: InputValues): Promise<MemoryVariables> {
    let query = '';
    if (this.inputKey && values[this.inputKey]) {
      query = String(values[this.inputKey]);
    } else {
      for (const v of Object.values(values)) {
        if (typeof v === 'string') { query = v; break; }
      }
    }

    let graph: MemoryContext | undefined;
    try {
      graph = await this.agent.getMemory(query || undefined);
    } catch {
      graph = undefined;
    }
    return { [this.memoryKey]: formatGraph(graph) };
  }

  async saveContext(inputValues: InputValues, outputValues: OutputValues): Promise<void> {
    let userMsg = '';
    if (this.inputKey && inputValues[this.inputKey]) {
      userMsg = String(inputValues[this.inputKey]);
    }

    let aiMsg = '';
    if (this.outputKey && outputValues[this.outputKey]) {
      aiMsg = String(outputValues[this.outputKey]);
    } else {
      for (const v of Object.values(outputValues)) {
        if (typeof v === 'string') { aiMsg = v; break; }
      }
    }

    const parts: string[] = [];
    if (userMsg) parts.push(`User: ${userMsg}`);
    if (aiMsg) parts.push(`Assistant: ${aiMsg}`);
    const turn = parts.join('\n').trim();
    if (!turn) return;

    try {
      await this.agent.ingest(turn);
    } catch {
      // Never break the chain just because ingest hiccuped.
    }
  }

  async clear(): Promise<void> {
    // Project-level wipe is not exposed by the API yet — intentional no-op.
  }
}
