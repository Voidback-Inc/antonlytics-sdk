/**
 * LangChain + Antonlytics quickstart.
 *
 * Install:
 *     npm install antonlytics @langchain/core @langchain/anthropic langchain
 *
 * Run:
 *     ANTONLYTICS_API_KEY=... \
 *     ANTONLYTICS_PROJECT_ID=... \
 *     ANTHROPIC_API_KEY=... \
 *     npx tsx examples/langchain-quickstart.ts
 */
import { Agent } from 'antonlytics';
import { AntonlyticsMemory } from 'antonlytics/integrations/langchain';

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ConversationChain } from 'langchain/chains';

async function main(): Promise<void> {
  const agent = new Agent({
    apiKey:    process.env.ANTONLYTICS_API_KEY!,
    projectId: process.env.ANTONLYTICS_PROJECT_ID!,
  });

  const memory = new AntonlyticsMemory({ agent, memoryKey: 'history', inputKey: 'input' });

  const llm = new ChatAnthropic({ model: 'claude-sonnet-4-5', temperature: 0 });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system',
      'You are a helpful assistant. Use the prior knowledge below when relevant.\n\n{history}'],
    ['human', '{input}'],
  ]);

  const chain = new ConversationChain({ llm, prompt, memory, inputKey: 'input' });

  // Teach it something.
  await chain.invoke({
    input: 'I had a sales call with Sarah from TechCorp about Enterprise pricing.',
  });

  // Ask it back with no keyword overlap. Hybrid retrieval should still pull Sarah/TechCorp.
  const out = await chain.invoke({ input: 'Anyone I should circle back with on a deal?' });
  console.log(out.response);
}

main().catch((e) => { console.error(e); process.exit(1); });
