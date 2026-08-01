# API Reference

Every public API below includes description, parameters, returns, example, and possible errors.

## `Agent`

Description: Facade for running a configured agent through the iterative runtime.

Parameters:

- `config.name`: Human-readable agent name.
- `config.provider`: A `ModelProvider` implementation.
- `config.instructions`: Optional system instructions.
- `config.tools`: Optional `ToolDefinition[]`.
- `config.guardrails`: Optional input/output guardrails.
- `config.handoffs`: Optional handoff handlers.
- `config.memory`: Optional runtime memory implementation.
- `config.eventBus`: Optional typed event bus.
- `config.maxIterations`: Optional loop limit, default `20`.
- `config.metadata`: Optional trace/event metadata.

Returns: An `Agent` instance.

Example:

```ts
const agent = new Agent({ name: "assistant", provider, tools: [tool] });
const result = await agent.run("Hello");
```

Possible errors: `ConfigurationError` for invalid configuration or providers that do not support registered tools.

## `Agent.create(config)`

Description: Async factory that applies plugins before constructing the agent.

Parameters: Same `AgentConfig` as `new Agent`, including optional `plugins`.

Returns: `Promise<Agent>`.

Example:

```ts
const agent = await Agent.create({ name: "with-plugins", provider, plugins: [plugin] });
```

Possible errors: Any error thrown by a plugin `setup()` call, plus `ConfigurationError`.

## `agent.run(input, options)`

Description: Executes one iterative agent run.

Parameters:

- `input`: A string or an array of SDK `Message` objects.
- `options.sessionId`: Optional persistent session id.
- `options.metadata`: Optional per-run metadata.

Returns: `Promise<RunResult>` with `runId`, `output`, `messages`, and `trace`.

Example:

```ts
const result = await agent.run("Summarize this", { sessionId: "thread-1" });
console.log(result.trace.toolCalls);
```

Possible errors: `ProviderError`, `GuardrailError`, `MaxIterationsError`, `ToolExecutionError` surfaced through failed tool results, or handler-specific errors.

## `agent.stream(input, options)`

Description: Runs the same iterative loop as `agent.run()` — model call, tool detection, tool execution, store result, repeat — but drives each model step through `provider.stream()` instead of `provider.generate()`. Yields `AgentStreamChunkEvent`s as text arrives, and finishes with a single `AgentStreamCompletedEvent` carrying the exact `RunResult` that `agent.run()` would have returned for the same input. Tool-call turns and turns with no text content yield no chunk events for that turn. Guardrails, tracing, and event emissions (`run.started`, `model.request`, `model.response`, `tool.*`, `run.completed`/`run.failed`) all fire identically to `agent.run()`; an output guardrail rewrite lands in the completed event and in persisted session history, not in chunks already streamed to the caller.

Parameters: Same as `agent.run(input, options)`.

Returns: `AsyncGenerator<AgentStreamEvent, RunResult, void>`, where `AgentStreamEvent` is `{ type: "chunk", runId, iteration, delta }` or `{ type: "completed", result }`. Must be consumed (e.g. with `for await`) to drive the run — nothing executes until iterated.

Example:

```ts
for await (const event of agent.stream("Summarize this")) {
  if (event.type === "chunk") {
    process.stdout.write(event.delta);
  } else {
    console.log("\n", event.result.trace.toolCalls, "tool calls");
  }
}
```

Possible errors: Same as `agent.run()` — `ProviderError` (including failures raised mid-stream by `provider.stream()`), `GuardrailError`, `MaxIterationsError`, handler-specific errors — surfaced by rejecting the pending `next()` call, so a `for await` loop throws exactly like an awaited `agent.run()` would.

## `createTool(tool)`

Description: Identity helper that preserves zod input inference for tool definitions.

Parameters:

- `name`: Tool name sent to the provider.
- `description`: Provider-facing description.
- `schema`: zod schema used before execution.
- `execute(input, context)`: Tool handler.
- `timeout`: Per-attempt timeout in milliseconds.
- `retry`: Retry policy with `attempts` and optional `backoffMs`.
- `metadata`: Tool metadata.

Returns: A typed `ToolDefinition`.

Example:

```ts
const lookup = createTool({
  name: "lookup",
  description: "Looks up a value.",
  schema: z.object({ key: z.string() }),
  timeout: 1000,
  retry: { attempts: 2 },
  metadata: {},
  execute: ({ key }) => ({ key }),
});
```

Possible errors: Tool handlers may throw. Invalid inputs are converted into failed `ToolExecutionResult` envelopes.

## `ToolExecutor`

Description: Executes one tool call with zod validation, timeout, retry, logs, and typed events.

Parameters:

- `new ToolExecutor({ events })`: Optional event bus.
- `execute(tool, request)`: A tool and a `ToolExecutorRequest` with `runId`, `toolCall`, and optional metadata.

Returns: `Promise<ToolExecutionResult>`.

Example:

```ts
const result = await executor.execute(tool, { runId, toolCall });
```

Possible errors: Does not throw for normal tool failures; returns `success: false`. Unexpected platform errors can still reject.

## `ModelProvider`

Description: Interface implemented by every model backend.

Parameters:

- `generate(request)`: Full model response. `request` is a `ModelRequest`: `messages`, `tools`, `metadata`, and an optional `responseFormat` (`{type:"text"}` / `{type:"json_object"}` / `{type:"json_schema", name, schema, strict?}`) for structured output.
- `stream(request)`: Async iterable of stream chunks.
- Capability methods: `supportsTools`, `supportsStructuredOutput`, `supportsImages`, `supportsAudio`. `AgentRuntime` checks `supportsTools`/`supportsImages` itself and throws `ConfigurationError` before calling the provider if a run needs a capability it lacks (registered tools, or a `UserMessage` with non-empty `images`).

Returns: Provider-specific `ModelResponse` or `ModelStreamChunk` values normalized to SDK types.

Example:

```ts
class MyProvider implements ModelProvider {
  readonly id = "my-provider";
  readonly model = "my-model";
  async generate(request) { return { id: "1", content: "Hello" }; }
  async *stream(request) { yield { id: "1", delta: "Hello", done: true }; }
  supportsTools() { return true; }
  supportsStructuredOutput() { return false; }
  supportsImages() { return false; }
  supportsAudio() { return false; }
}
```

Possible errors: Provider implementations may throw; runtime wraps generation failures in `ProviderError`.

## `OpenAIProvider`

Description: Real `ModelProvider` backed by the `openai` SDK. Import from the `mine-agent-sdk/providers/openai` subpath, not the root package — this keeps `openai` an optional peer dependency instead of a hard dependency of every install.

Parameters:

- `new OpenAIProvider({ model, apiKey?, baseURL?, organization?, client? })`: `apiKey` defaults to `OPENAI_API_KEY`. Pass `client` (a pre-built or fake `OpenAI` instance) to override construction entirely — this is also how tests inject a test double instead of hitting the network.

Behavior:

- Maps `Message[]` to/from OpenAI chat messages, including multi-turn tool-call history (`AssistantMessage.toolCalls` ↔ `tool_calls`, `ToolMessage` ↔ a `role: "tool"` message).
- `generate()` uses `chat.completions.create()`; `stream()` uses it with `stream: true` and reconstructs fragmented streaming tool-call deltas (OpenAI only sends a tool call's `id`/`name` on its first chunk) so every `ModelStreamChunk.toolCallDelta` your code sees carries a stable `id`.
- `request.responseFormat` maps to OpenAI's `response_format` (`text` / `json_object` / `json_schema`).
- `UserMessage.images` (an array of `{ url }`, http(s) or `data:`) maps to multipart `image_url` content parts.
- Tool parameter schemas are converted from zod to JSON Schema via `zodToJsonSchema` — see below for its coverage.
- `supportsTools`/`supportsStructuredOutput`/`supportsImages` all return `true`; `supportsAudio` returns `false` (not implemented).
- Token usage maps to `ModelUsage`; there's no built-in `costUsd` (pricing changes too often to hardcode) — compute it yourself from `usage` if needed.

Returns: A `ModelProvider` usable anywhere one is accepted (`AgentConfig.provider`).

Example:

```ts
import { Agent } from "mine-agent-sdk";
import { OpenAIProvider } from "mine-agent-sdk/providers/openai";

const agent = new Agent({
  name: "assistant",
  provider: new OpenAIProvider({ model: "gpt-4o-mini" }),
});
const result = await agent.run("Hello");
```

Possible errors: Network/API errors from the `openai` SDK propagate out of `generate()`/`stream()` and are wrapped in `ProviderError` by `AgentRuntime`. Requires `openai` `^4.20.0 || ^5.0.0 || ^6.0.0` installed (`openai@7` needs Node 22+, newer than this SDK's own `engines.node: >=20`).

## `AnthropicProvider`

Description: Real `ModelProvider` backed by the `@anthropic-ai/sdk` SDK. Import from the `mine-agent-sdk/providers/anthropic` subpath, not the root package, for the same optional-peer-dependency reason as `OpenAIProvider`.

Parameters:

- `new AnthropicProvider({ model, apiKey?, baseURL?, maxTokens?, client? })`: `apiKey` defaults to `ANTHROPIC_API_KEY`. `maxTokens` defaults to `4096` — Anthropic requires `max_tokens` on every request, unlike OpenAI where it's optional. `client` overrides construction entirely, same test-injection use as `OpenAIProvider`.

Behavior (differences from `OpenAIProvider` driven by real API shape differences, not arbitrary choices):

- `SystemMessage`s are collected and sent via the top-level `system` param — Anthropic's `messages` array has no system role.
- Consecutive `ToolMessage`s are merged into a single Anthropic `user` message containing multiple `tool_result` content blocks, because Anthropic requires strict `user`/`assistant` alternation (you can't send one `tool` message per result the way OpenAI allows).
- `request.responseFormat: {type:"json_schema", name, schema}` has no native equivalent, so it's implemented as a forced tool call: a synthetic tool named `name` with `input_schema: schema` is added and `tool_choice` is forced to it; the resulting `tool_use.input` is JSON-stringified into `ModelResponse.content` instead of appearing in `toolCalls`. Throws `ConfigurationError` if `name` collides with a real registered tool. `{type:"json_object"}` and `{type:"text"}` are accepted but not specially enforced (Anthropic has no grammar-level JSON mode).
- `UserMessage.images` maps to Anthropic `image` content blocks — a `data:` URI becomes a `{type:"base64", media_type, data}` source, anything else becomes `{type:"url", url}`.
- Streaming reconstructs the same way as `OpenAIProvider` (stable `id`/`name` carried across `input_json_delta` fragments); a structured-output tool call's fragments are re-emitted as plain text `delta`s instead of `toolCallDelta`s, matching the non-streaming unwrap behavior.
- `supportsTools`/`supportsStructuredOutput`/`supportsImages` all return `true`; `supportsAudio` returns `false`.

Returns: A `ModelProvider` usable anywhere one is accepted (`AgentConfig.provider`).

Example:

```ts
import { Agent } from "mine-agent-sdk";
import { AnthropicProvider } from "mine-agent-sdk/providers/anthropic";

const agent = new Agent({
  name: "assistant",
  provider: new AnthropicProvider({ model: "claude-3-5-sonnet-latest" }),
});
const result = await agent.run("Hello");
```

Possible errors: `ConfigurationError` for a `responseFormat` name collision (see above). Network/API errors from `@anthropic-ai/sdk` propagate out of `generate()`/`stream()` and are wrapped in `ProviderError` by `AgentRuntime`. Requires `@anthropic-ai/sdk` `^0.30.0` installed.

## `zodToJsonSchema`

Description: Converts a zod schema into a JSON Schema object, used internally by provider adapters to build a tool's `parameters`/`input_schema` payload.

Parameters:

- `schema`: A `z.ZodTypeAny`.

Returns: A `JsonSchema` (`Record<string, unknown>`). Covers `object` (with `required`/`additionalProperties: false`), `string`, `number`, `boolean`, `null`, `array`, `enum`, `nativeEnum`, `union` (as `anyOf`), `record`, `literal` (as `const`), and `optional`/`nullable`/`default` wrappers (nullable becomes a `type` array including `"null"`). Descriptions set via `.describe()` are preserved. Zod effects (`refine`/`transform`), tuples, and intersections fall back to an unconstrained `{}`.

Example:

```ts
zodToJsonSchema(z.object({ city: z.string(), limit: z.number().optional() }));
// { type: "object", properties: { city: {type:"string"}, limit: {type:"number"} }, required: ["city"], additionalProperties: false }
```

Possible errors: None — unrecognized zod types degrade to `{}` rather than throwing.

## `EventBus`

Description: Typed wrapper around `eventemitter3` for SDK lifecycle events.

Parameters:

- `on(event, handler)`, `once(event, handler)`, `off(event, handler)`, `emit(event, payload)`.

Returns: The bus for subscription methods, boolean for `emit`.

Example:

```ts
events.on("run.completed", ({ trace }) => console.log(trace.durationMs));
```

Possible errors: Handler errors are controlled by `eventemitter3` behavior and should be handled in user callbacks.

## `SessionMemory`, `SessionManager`, `StorageAdapter`

Description: Memory boundary for loading and saving session messages without exposing storage internals to runtime code.

Parameters:

- `new InMemoryStorageAdapter()`
- `new SessionManager(storage)`
- `new SessionMemory(sessionManager)`

Returns: `RuntimeMemory` implementation for `AgentConfig.memory`.

Example:

```ts
const memory = new SessionMemory(new SessionManager(new InMemoryStorageAdapter()));
const agent = new Agent({ name: "stateful", provider, memory });
await agent.run("Remember this", { sessionId: "user-1" });
```

Possible errors: Storage adapter implementations may throw IO-specific errors.

## `Guardrail`

Description: Input or output policy hook that can block or rewrite the value flowing through a run.

Parameters:

- `name`
- `phase`: `"input"` or `"output"`
- `execute(value, context)`

Returns: `GuardrailResult` with `allowed`, optional `reason`, optional `metadata`, and optional `value`. Setting `value` on an allowed result substitutes it for the checked value — an input guardrail's `value` reaches the model and session history, an output guardrail's `value` becomes `RunResult.output` and replaces the persisted assistant message. Guardrails in the same phase run in order, each seeing the previous guardrail's `value`.

Example:

```ts
const redactCardNumbers = {
  name: "redact-card-numbers",
  phase: "input",
  execute: value => ({
    allowed: true,
    value: String(value).replace(/\d{4}-\d{4}-\d{4}-\d{4}/g, "[redacted]"),
  }),
};
```

Possible errors: Blocked guardrails throw `GuardrailError` and emit `guardrail.triggered`. Guardrails that set `value` emit `guardrail.modified` instead.

## `HandoffDefinition`

Description: Named handler for delegating a run to another subsystem or agent. The receiving handler gets the full conversation so far via `context.messages`, so it can pick up exactly where the caller left off.

Parameters:

- `name`
- `description`
- `execute(request, context)`: `context` has `runId`, `metadata`, and `messages` (the caller's conversation, excluding the caller's own transient instructions message).
- `metadata`

Returns: `HandoffResult` with `output` and optional `metadata`.

Example:

```ts
const billingHandoff = {
  name: "billing",
  description: "Routes billing questions.",
  metadata: {},
  async execute(request, context) {
    const billingAgent = new Agent({ name: "billing-agent", instructions: "...", provider });
    const result = await billingAgent.run(context.messages);
    return { output: result.output };
  },
};
```

Possible errors: Missing targets throw `ConfigurationError`. Handler failures fail the run.

## `AgentPlugin`

Description: Extension point with a full lifecycle: register → init → hook into events/runtime → teardown.

Parameters:

- `name`
- `version`
- `setup(context)`: Registers tools, guardrails, handoffs, or replaces the provider. `context.events` is the agent's real `EventBus`, so a plugin can also subscribe to runtime events here.
- `init?(context)`: Optional. Runs once after every plugin's `setup()` has finished. `context` carries the full merged `tools`/`guardrails`/`handoffs`/`provider` from all plugins, not just this one — useful for cross-cutting setup that needs to see the final registry.
- `teardown?(context)`: Optional. Runs when `agent.teardown()` is called, in reverse registration order (last plugin set up tears down first).

Returns: Nothing or a promise, for each hook.

Example:

```ts
const auditPlugin = {
  name: "audit",
  setup(ctx) {
    ctx.registerTool(addTool);
  },
  init(ctx) {
    console.log(`agent has ${ctx.tools.length} tools registered`);
  },
  teardown() {
    console.log("audit plugin cleaned up");
  },
};
const agent = await Agent.create({ name: "agent", provider, plugins: [auditPlugin] });
await agent.run("hi");
await agent.teardown();
```

Possible errors: Errors from `setup()` or `init()` reject `Agent.create`. Errors from `teardown()` reject `agent.teardown()`.
