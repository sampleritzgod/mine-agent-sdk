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

- `generate(request)`: Full model response.
- `stream(request)`: Async iterable of stream chunks.
- Capability methods: `supportsTools`, `supportsStructuredOutput`, `supportsImages`, `supportsAudio`.

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
