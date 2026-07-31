# Changelog

## Unreleased

- Guardrails can now rewrite the value they check (`GuardrailResult.value`), not just allow/block it. Input-phase rewrites reach the model and session history; output-phase rewrites become `RunResult.output` and replace the persisted assistant message. Emits a new `guardrail.modified` event.

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
