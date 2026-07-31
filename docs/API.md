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

Description: Input or output policy hook.

Parameters:

- `name`
- `phase`: `"input"` or `"output"`
- `execute(value, context)`

Returns: `GuardrailResult` with `allowed`, optional `reason`, and optional metadata.

Example:

```ts
const guardrail = {
  name: "no-empty-output",
  phase: "output",
  execute: value => ({ allowed: String(value).length > 0 }),
};
```

Possible errors: Blocked guardrails throw `GuardrailError` and emit `guardrail.triggered`.

## `HandoffDefinition`

Description: Named handler for delegating a run to another subsystem or agent.

Parameters:

- `name`
- `description`
- `execute(request, context)`
- `metadata`

Returns: `HandoffResult`.

Example:

```ts
const billingHandoff = {
  name: "billing",
  description: "Routes billing questions.",
  metadata: {},
  execute: request => ({ output: `billing:${request.input}` }),
};
```

Possible errors: Missing targets throw `ConfigurationError`. Handler failures fail the run.

## `AgentPlugin`

Description: Extension point for registering tools, guardrails, handoffs, or replacing the provider before agent construction.

Parameters:

- `name`
- `version`
- `setup(context)`

Returns: Nothing or a promise.

Example:

```ts
const plugin = {
  name: "math-tools",
  setup(ctx) {
    ctx.registerTool(addTool);
  },
};
const agent = await Agent.create({ name: "agent", provider, plugins: [plugin] });
```

Possible errors: Plugin setup errors reject `Agent.create`.
