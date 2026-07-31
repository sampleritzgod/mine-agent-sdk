# Mine Agent SDK

Mine Agent SDK is a TypeScript-first AI agent runtime built around small, swappable contracts: model providers, zod-validated tools, typed events, persistent sessions, storage adapters, guardrails, handoffs, tracing, and plugins.

The SDK is intentionally original and dependency-light. Runtime code depends only on `eventemitter3` for events and `zod` for schemas. Provider adapters can be added without changing the runtime.

## Install

```bash
npm install mine-agent-sdk zod eventemitter3
```

## Quick Start

```ts
import { Agent, ScriptedProvider, createTool } from "mine-agent-sdk";
import { z } from "zod";

const add = createTool({
  name: "add",
  description: "Adds two numbers.",
  schema: z.object({ a: z.number(), b: z.number() }),
  timeout: 1000,
  retry: { attempts: 1 },
  metadata: {},
  execute(input) {
    return input.a + input.b;
  },
});

const provider = new ScriptedProvider([
  {
    id: "step_1",
    content: "",
    toolCalls: [{ id: "call_1", name: "add", arguments: { a: 2, b: 3 } }],
  },
  { id: "step_2", content: "The answer is 5." },
]);

const agent = new Agent({
  name: "math-agent",
  instructions: "Be concise and accurate.",
  provider,
  tools: [add],
});

const result = await agent.run("Add 2 and 3.");
console.log(result.output);
```

## Architecture

```text
src/
  core/        Agent facade and public run configuration
  runtime/     Iterative state machine and execution loop
  providers/   Provider interface and testable scripted provider
  memory/      Runtime memory boundary
  sessions/    Persistent session API
  storage/     Storage adapter contract and in-memory adapter
  tools/       Tool definitions, registry, executor
  events/      Typed event bus over eventemitter3
  tracing/     Run trace and token/cost/tool accounting
  guardrails/  Input/output guardrail interfaces
  handoffs/    Handoff definitions and manager
  plugins/     Plugin setup context and host
  types/       Shared message, model, JSON, metadata types
  errors/      Public SDK error hierarchy
  utils/       Small shared helpers
```

## Runtime Loop

The runtime is iterative and phase-driven:

```text
INPUT -> MODEL -> TOOL DETECTION -> EXECUTE TOOL -> STORE RESULT
      -> MODEL -> FINAL ANSWER -> TRACE -> RETURN
```

Each run records an explicit `RuntimeState`, emits lifecycle events, stores tool output as tool messages, and produces a `RunTrace` with timing, tokens, cost, retries, tool calls, handoffs, errors, and final output.

## Providers

The core package only ever needs `zod` and `eventemitter3` — real model providers live behind subpath exports so their SDKs stay optional peer dependencies, not part of every install.

```bash
npm install openai   # only needed if you use OpenAIProvider
```

```ts
import { Agent } from "mine-agent-sdk";
import { OpenAIProvider } from "mine-agent-sdk/providers/openai";

const agent = new Agent({
  name: "assistant",
  provider: new OpenAIProvider({ model: "gpt-4o-mini" }), // reads OPENAI_API_KEY by default
});
```

`OpenAIProvider` maps SDK messages/tools/responses to and from the OpenAI Chat Completions API: tool calls, streaming (including reconstructing fragmented tool-call arguments across chunks), `responseFormat` (`text` / `json_object` / `json_schema`), and image inputs via `UserMessage.images`. It supports `openai` `^4.20.0 || ^5.0.0 || ^6.0.0` — `openai@7` requires Node 22+, which is newer than this SDK's own `engines.node: >=20`, so pin below `7.0.0` if you're on Node 20 or 21.

## Streaming

`agent.stream()` runs the exact same loop as `agent.run()` — it just drives each model step through `provider.stream()` and yields text as it arrives, finishing with a `completed` event that carries the same `RunResult` `agent.run()` would return:

```ts
for await (const event of agent.stream("Add 4 and 6.")) {
  if (event.type === "chunk") {
    process.stdout.write(event.delta);
  } else {
    console.log("\n" + event.result.output);
  }
}
```

Tool detection, execution, guardrails, tracing, and events all behave identically to `agent.run()`; tool-call turns just don't produce chunk events since there's no text to stream.

## Events

Subscribe through `EventBus`:

```ts
const events = new EventBus();
events.on("tool.failed", event => {
  console.error(event.toolCall.name, event.result.error?.message);
});
```

Minimum emitted events:

- `run.started`, `run.completed`, `run.failed`
- `tool.started`, `tool.finished`, `tool.failed`
- `model.request`, `model.response`
- `handoff.started`, `handoff.completed`
- `guardrail.triggered`, `guardrail.modified`

## Memory Layers

The SDK keeps memory boundaries separate:

```text
Agent Configuration -> Runtime State -> Persistent Session -> Storage Adapter
```

Runtime code talks to `RuntimeMemory`. `SessionMemory` talks to `SessionManager`. `PersistentSession` talks to `StorageAdapter`.

## Development

```bash
npm install
npm test
```

## Examples

```bash
npm run example:basic     # single tool call, end to end
npm run example:tool-use  # multiple tools, retries, event logging
npm run example:streaming # ModelProvider.stream() directly, and agent.stream() driving the tool loop
npm run example:handoff   # one agent handing off full context to another
npm run example:openai    # real OpenAIProvider request (needs OPENAI_API_KEY + npm install openai)
```

- [`examples/basic.ts`](examples/basic.ts)
- [`examples/tool-use.ts`](examples/tool-use.ts)
- [`examples/streaming.ts`](examples/streaming.ts)
- [`examples/multi-agent-handoff.ts`](examples/multi-agent-handoff.ts)
- [`examples/openai-provider.ts`](examples/openai-provider.ts)

## Documentation

- [API docs](docs/API.md)
- [Migration guide](docs/MIGRATION.md)
- [Changelog](CHANGELOG.md)
