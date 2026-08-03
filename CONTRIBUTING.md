# Contributing

## Setup

Requires Node (see [`.nvmrc`](.nvmrc)) and pnpm.

```bash
pnpm install
```

## Workflow

```bash
pnpm build       # turbo run build -> packages/core's dist/index.{js,mjs,d.ts,d.mts} + dist/providers/*, plus apps/web
pnpm typecheck   # turbo run typecheck across every package
pnpm test        # packages/core's test suite, via tsx against TS sources directly
pnpm lint        # eslint across every package
pnpm format:check
pnpm check       # all of the above, in order — what CI runs
```

Run `pnpm check` before opening a PR.

## Repository layout

- `packages/core/` — the SDK itself, published as `mine-agent-sdk`.
- `apps/web/` — the docs/landing site (Next.js).
- `examples/*/` — runnable example packages, each depending on `mine-agent-sdk` via `workspace:*`.

## Architecture

Read the [root README](README.md) and [`packages/core`'s API docs](packages/core/docs/API.md) first. In short:

- The runtime is an **iterative state machine**, never recursive: `INPUT -> MODEL -> TOOL DETECTION -> EXECUTE TOOL -> STORE RESULT -> MODEL -> FINAL ANSWER -> TRACE -> RETURN`.
- Every `ModelProvider` implements `generate`, `stream`, `supportsTools`, `supportsStructuredOutput`, `supportsImages`, `supportsAudio`.
- Real provider SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`) are optional peer dependencies, wired in as their own `mine-agent-sdk/providers/*` subpath — never import one from `packages/core/src/index.ts`, or you'll force every consumer to install every provider's SDK. CI asserts `packages/core/package.json` has no provider SDK as a hard dependency.
- Every tool has `name`, `description`, `schema`, `execute()`, `timeout`, `retry`, `metadata`, and returns a `success`/`error`/`timing`/`logs`/`result` envelope.
- Every meaningful action emits a typed event through `EventBus` (`run.*`, `tool.*`, `model.*`, `handoff.*`, `guardrail.*`).
- No dependency on or architectural borrowing from existing agent frameworks (LangGraph, Mastra, CrewAI, AutoGen, PydanticAI, LlamaIndex Agents, OpenAI Agents SDK, Google ADK) — this SDK is original.

## Adding or changing a feature

1. Unit test the isolated logic; add an integration test through `Agent`/`AgentRuntime` if the feature affects the run loop; add a failure-path or edge-case test if it can fail.
2. Update `packages/core/docs/API.md` (description, parameters, returns, example, possible errors) for any public API you add or change.
3. Update `packages/core/README.md` (and the root `README.md` if it affects install/quick-start) if setup changes.
4. Run `pnpm changeset` to describe the change for the next release — this is what drives `CHANGELOG.md` and the version bump.
5. If you change the shape of an existing public API in a breaking way, add a note to `packages/core/docs/MIGRATION.md`.

## Commit / PR style

- Keep commits focused; explain _why_ in the body, not just _what_.
- PRs should pass `pnpm check` locally before you open them.
- Be respectful — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
