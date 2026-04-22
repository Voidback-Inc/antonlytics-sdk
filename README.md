# Antonlytics JavaScript/TypeScript SDK

Memory for AI Agents - Simple natural language SDK.

[![npm version](https://badge.fury.io/js/antonlytics.svg)](https://badge.fury.io/js/antonlytics)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install antonlytics
```

Or with Yarn:

```bash
yarn add antonlytics
```

## Quick Start

```typescript
import { Agent } from 'antonlytics';

// Initialize agent
const agent = new Agent({
  apiKey: 'your-api-key',
  projectId: 'your-project-id'
});

// Ingest - agent learns from natural language
await agent.ingest(`
  Had a call with Sarah Johnson from TechCorp today.
  She's interested in our Enterprise plan for 50 users.
  Follow up next Tuesday.
`);

// Chat - agent remembers and responds
const response = await agent.chat("Who should I follow up with?");
console.log(response.response);
// => "You should follow up with Sarah Johnson from TechCorp..."
```

## Features

- **Natural Language Ingestion** - No complex entity creation, just plain English
- **AI-Powered Chat** - Chat with your agent using our model + your memory
- **Memory Access** - Get structured memory for your own AI model
- **System Prompts** - Configure agent behavior and personality
- **TypeScript Support** - Full type definitions included
- **Works Everywhere** - Node.js and modern browsers

## Two Usage Options

### Option 1: Use Our Model

Full-service AI with your system prompt + memory:

```typescript
// We handle everything
const response = await agent.chat("Who should I follow up with?");
console.log(response.response);
```

### Option 2: Use Your Model

Just get memory context for your own model:

```typescript
// Get memory
const memory = await agent.getMemory();

// Use with your model (OpenAI, Anthropic, etc.)
import OpenAI from 'openai';
const openai = new OpenAI();

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are a sales assistant" },
    { role: "system", content: `Memory: ${JSON.stringify(memory)}` },
    { role: "user", content: "Who to follow up?" }
  ]
});
```

## Documentation

### Agent Class

#### `constructor(config: AgentConfig)`

Initialize the agent.

**Parameters:**
- `config.apiKey` (string): Your Antonlytics API key
- `config.projectId` (string): Your project/agent ID
- `config.baseUrl` (string, optional): API base URL

```typescript
const agent = new Agent({
  apiKey: 'your-api-key',
  projectId: 'your-project-id'
});
```

#### `ingest(text: string): Promise<IngestResponse>`

Ingest natural language text and extract entities/relationships.

**Parameters:**
- `text` (string): Natural language text (conversations, notes, emails)

**Returns:**
- Promise with extracted entities and relationships

**Example:**
```typescript
const result = await agent.ingest("Customer Alice bought Laptop Pro for $999");
console.log(result.created);  // {entities: 2, relationships: 1}
```

#### `chat(message: string, history?: Message[]): Promise<ChatResponse>`

Chat with your agent. Uses system prompt + full memory context.

**Parameters:**
- `message` (string): Your question or message
- `history` (Message[], optional): Conversation history

**Returns:**
- Promise with response and relevant entities

**Example:**
```typescript
const response = await agent.chat("Who bought laptops?");
console.log(response.response);
console.log(response.relevant_entities);
```

#### `getMemory(query?: string): Promise<MemoryContext>`

Get structured memory for your own AI model.

**Parameters:**
- `query` (string, optional): Natural language query to filter memory

**Returns:**
- Promise with entities and relationships

**Example:**
```typescript
const memory = await agent.getMemory("laptop purchases");
// Use with your own model
```

#### `setSystemPrompt(prompt: string): Promise<{system_prompt: string}>`

Configure agent behavior and personality.

**Parameters:**
- `prompt` (string): System prompt text

**Example:**
```typescript
await agent.setSystemPrompt(`
  You are a helpful sales assistant.
  Be concise and action-oriented.
  Focus on follow-ups and next steps.
`);
```

#### `getSystemPrompt(): Promise<string>`

Get current system prompt.

**Returns:**
- Promise with system prompt text

## Error Handling

```typescript
import { Agent, AntonlyticsError, APIError, AuthenticationError } from 'antonlytics';

try {
  const agent = new Agent({ apiKey: 'invalid', projectId: 'test' });
  await agent.chat("Hello");
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Auth error:', error.message);
  } else if (error instanceof APIError) {
    console.error('API error:', error.statusCode, error.message);
  } else if (error instanceof AntonlyticsError) {
    console.error('Error:', error.message);
  }
}
```

## Complete Example

```typescript
import { Agent } from 'antonlytics';

// Initialize
const agent = new Agent({
  apiKey: 'your-api-key',
  projectId: 'your-project-id'
});

// Set behavior
await agent.setSystemPrompt(`
  You are a sales assistant.
  Focus on follow-ups and next steps.
`);

// Ingest multiple conversations
await agent.ingest(`
  Call with Mike Rodriguez from StartupXYZ.
  He's the founder. Looking at our API for their mobile app.
  Has 100K users. Wants custom pricing.
  Send proposal by Friday.
`);

await agent.ingest(`
  Email from Sarah Chen at BigCorp.
  VP of Engineering. Interested in Enterprise.
  Team of 200 developers. Budget discussion next week.
`);

// Query memory
const response = await agent.chat("What are my top priorities this week?");
console.log(response.response);

// Get all contacts
const contacts = await agent.chat("List all people I've talked to");
contacts.relevant_entities
  .filter(e => e.type === "Person")
  .forEach(e => console.log(`- ${e.name}`));
```

## TypeScript Types

Full TypeScript support with type definitions:

```typescript
import type {
  AgentConfig,
  IngestResponse,
  ChatResponse,
  MemoryContext,
  Message
} from 'antonlytics';
```

## Node.js vs Browser

### Node.js (CommonJS)

```javascript
const { Agent } = require('antonlytics');

const agent = new Agent({
  apiKey: process.env.ANTONLYTICS_API_KEY,
  projectId: process.env.ANTONLYTICS_PROJECT_ID
});
```

### Node.js (ESM)

```javascript
import { Agent } from 'antonlytics';

const agent = new Agent({
  apiKey: process.env.ANTONLYTICS_API_KEY,
  projectId: process.env.ANTONLYTICS_PROJECT_ID
});
```

### Browser

```html
<script type="module">
  import { Agent } from 'https://unpkg.com/antonlytics@2.0.0/dist/index.mjs';

  const agent = new Agent({
    apiKey: 'your-api-key',
    projectId: 'your-project-id'
  });

  // Use agent
  const response = await agent.chat("Hello");
  console.log(response);
</script>
```

## React Example

```tsx
import { Agent } from 'antonlytics';
import { useState, useEffect } from 'react';

function ChatWithAgent() {
  const [agent] = useState(() => new Agent({
    apiKey: process.env.REACT_APP_ANTONLYTICS_API_KEY!,
    projectId: process.env.REACT_APP_ANTONLYTICS_PROJECT_ID!
  }));
  
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');

  const handleChat = async () => {
    const result = await agent.chat(message);
    setResponse(result.response);
  };

  return (
    <div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask your agent..."
      />
      <button onClick={handleChat}>Send</button>
      {response && <div>{response}</div>}
    </div>
  );
}
```

## Requirements

- Node.js >= 14.0.0 (for Node.js usage)
- Modern browser with ES2020 support (for browser usage)

## Development

```bash
# Clone repository
git clone https://github.com/Voidback-Inc/antonlytics-js-sdk
cd antonlytics-js-sdk

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Links

- [Documentation](https://antonlytics.com/docs/javascript-sdk)
- [API Reference](https://antonlytics.com/docs/api)
- [GitHub](https://github.com/Voidback-Inc/antonlytics-js-sdk)
- [npm](https://www.npmjs.com/package/antonlytics)
- [Website](https://antonlytics.com)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- Email: support@antonlytics.com
- Documentation: https://antonlytics.com/docs
- Issues: https://github.com/Voidback-Inc/antonlytics-js-sdk/issues
