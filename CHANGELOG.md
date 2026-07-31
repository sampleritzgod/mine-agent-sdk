# Changelog

## Unreleased

- Added a real `OpenAIProvider` (`mine-agent-sdk/providers/openai` subpath export) backed by the `openai` SDK: message/tool-call mapping in both directions, `generate()`/`stream()` (with fragmented streaming tool-call reconstruction), `responseFormat` (`text`/`json_object`/`json_schema`), and image inputs via the new `UserMessage.images`. Kept as a peer dependency behind a separate build entry/subpath so the core package still only needs `zod` + `eventemitter3`. Added a hand-rolled `zodToJsonSchema` utility for tool parameter schemas. `ModelRequest` gained `responseFormat`; `AgentConfig`/`RunOptions` gained a matching `responseFormat`; `AgentRuntime` now throws `ConfigurationError` if a run has image messages but the provider doesn't `supportsImages()`. Added `examples/openai-provider.ts` (`npm run example:openai`).
- Added `agent.stream(input, options)` / `AgentRuntime.stream()`: a real streaming run path that drives the same iterative tool-detection/execute/store-result loop as `agent.run()` through `provider.stream()` instead of `provider.generate()`, yielding `AgentStreamChunkEvent`s as text arrives and finishing with an `AgentStreamCompletedEvent` carrying the same `RunResult` `agent.run()` would return. The model-call loop body is now shared between `run()` and `stream()` (no parallel implementation). Added `src/runtime/model-stream-accumulator.ts` to accumulate `ModelStreamChunk` deltas (including fragmented `toolCallDelta`s) into a full `ModelResponse`. Fixed `ScriptedProvider.stream()` to propagate `toolCalls` so scripted tests can exercise the tool loop over streaming.
- Guardrails can now rewrite the value they check (`GuardrailResult.value`), not just allow/block it. Input-phase rewrites reach the model and session history; output-phase rewrites become `RunResult.output` and replace the persisted assistant message. Emits a new `guardrail.modified` event.
- `HandoffContext` now includes `messages`: the full conversation so far (minus the caller's own transient instructions), so a receiving handler/agent can continue with the same context instead of only a short `input` string.
- `AgentPlugin` gained an optional `init(context)` hook (runs once after every plugin's `setup()`, with the full merged tool/guardrail/handoff/provider registry) and an optional `teardown(context)` hook, run via the new `agent.teardown()` in reverse registration order.
- Added failure-path test coverage for tool timeout, retry exhaustion, provider errors, and malformed tool schema/arguments.
- Added `examples/tool-use.ts`, `examples/streaming.ts`, and `examples/multi-agent-handoff.ts`, plus `npm run example:*` scripts for all four examples.

## `0.1.0`

- Added TypeScript SDK scaffold.
- Added iterative `AgentRuntime` state machine.
- Added provider interface and scripted provider.
- Added zod-backed tool definitions, registry, executor, timeout, retry, logs, and result envelopes.
- Added typed event bus with run, tool, model, guardrail, and handoff events.
- Added run tracing with tokens, cost, retries, tool calls, handoffs, errors, and final output.
- Added memory/session/storage boundaries with in-memory storage adapter.
- Added guardrail, handoff, and plugin extension points.
- Added unit, integration, failure, edge, and concurrency tests.
- Added README, API docs, migration guide, and example.
