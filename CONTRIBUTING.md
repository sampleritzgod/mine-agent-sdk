# Contributing

## Setup

```bash
npm install
```

## Workflow

```bash
npm run build       # tsup -> dist/index.{js,mjs,d.ts,d.mts} + dist/providers/*
npm run typecheck   # tsc --noEmit across src/tests/examples
npm test            # runs tests/**/*.test.ts directly via tsx, no build step needed
npm pack --dry-run  # inspect exactly what would be published
```

Run all three (`build`, `typecheck`, `test`) before opening a PR — CI runs the same three plus `npm pack --dry-run` on Node 20.x and 22.x.

## Architecture

Read the [README](README.md#architecture) and [API docs](docs/API.md) first. In short:

- The runtime is an **iterative state machine**, never recursive: `INPUT -> MODEL -> TOOL DETECTION -> EXECUTE TOOL -> STORE RESULT -> MODEL -> FINAL ANSWER -> TRACE -> RETURN`.
- Every `ModelProvider` implements `generate`, `stream`, `supportsTools`, `supportsStructuredOutput`, `supportsImages`, `supportsAudio`.
- Real provider SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`) are optional peer dependencies, wired in as their own `mine-agent-sdk/providers/*` subpath — never import one from `src/index.ts`, or you'll force every consumer to install every provider's SDK.
- Every tool has `name`, `description`, `schema`, `execute()`, `timeout`, `retry`, `metadata`, and returns a `success`/`error`/`timing`/`logs`/`result` envelope.
- Every meaningful action emits a typed event through `EventBus` (`run.*`, `tool.*`, `model.*`, `handoff.*`, `guardrail.*`).
- No dependency on or architectural borrowing from existing agent frameworks (LangGraph, Mastra, CrewAI, AutoGen, PydanticAI, LlamaIndex Agents, OpenAI Agents SDK, Google ADK) — this SDK is original.

## Adding or changing a feature

1. Unit test the isolated logic; add an integration test through `Agent`/`AgentRuntime` if the feature affects the run loop; add a failure-path or edge-case test if it can fail.
2. Update `docs/API.md` (description, parameters, returns, example, possible errors) for any public API you add or change.
3. Update the `README.md` if it affects setup, install, or the quick-start flow.
4. Add a line under `## Unreleased` in `CHANGELOG.md`.
5. If you change the shape of an existing public API in a breaking way, add a note to `docs/MIGRATION.md`.

## Commit / PR style

- Keep commits focused; explain *why* in the body, not just *what*.
- PRs should pass `npm run build && npm run typecheck && npm test` locally before you open them.
- Be respectful — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
