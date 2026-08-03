# mine-agent-sdk

[![CI](https://github.com/sampleritzgod/mine-agent-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/sampleritzgod/mine-agent-sdk/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mine-agent-sdk.svg)](https://www.npmjs.com/package/mine-agent-sdk)
[![license](https://img.shields.io/npm/l/mine-agent-sdk.svg)](LICENSE)

A production-oriented TypeScript AI agent SDK: an iterative agent runtime with real OpenAI/Anthropic/Gemini providers, zod-validated tools, guardrails that can block or rewrite, multi-agent handoffs with full context transfer, streaming, tracing, and a plugin lifecycle — built on `zod` and `eventemitter3` only, with every provider SDK kept behind its own optional subpath.

```bash
npm install mine-agent-sdk zod eventemitter3
```

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

const agent = new Agent({
  name: "math-agent",
  provider: new ScriptedProvider([
    {
      id: "s1",
      content: "",
      toolCalls: [{ id: "c1", name: "add", arguments: { a: 2, b: 3 } }],
    },
    { id: "s2", content: "The answer is 5." },
  ]),
  tools: [add],
});

console.log((await agent.run("Add 2 and 3.")).output);
```

Full package documentation: [`packages/core/README.md`](packages/core/README.md) · [API reference](packages/core/docs/API.md).

## Repository layout

```text
packages/core/   the SDK, published as `mine-agent-sdk`
apps/web/        landing page + documentation (Next.js)
examples/        runnable example packages
```

## Development

Requires Node (see [`.nvmrc`](.nvmrc)) and pnpm.

```bash
pnpm install
pnpm check   # format:check + lint + typecheck + test + build, everything a PR needs to pass
```

| Script                         | What it does                           |
| ------------------------------ | -------------------------------------- |
| `pnpm build`                   | Build every package via Turborepo      |
| `pnpm test`                    | Run `packages/core`'s test suite       |
| `pnpm typecheck`               | Typecheck every package                |
| `pnpm lint`                    | Lint every package                     |
| `pnpm format` / `format:check` | Prettier, write or check               |
| `pnpm web`                     | Run the docs site locally              |
| `pnpm changeset`               | Describe a change for the next release |

## Examples

```bash
pnpm example:basic     # single tool call, end to end
pnpm example:tool-use  # multiple tools, retries, event logging
pnpm example:streaming # ModelProvider.stream() directly, and agent.stream() driving the tool loop
pnpm example:handoff   # one agent handing off full context to another
pnpm example:openai    # real OpenAIProvider request (needs OPENAI_API_KEY)
pnpm example:anthropic # real AnthropicProvider request (needs ANTHROPIC_API_KEY)
pnpm example:gemini    # real GeminiProvider request (needs GEMINI_API_KEY)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT © Abhay Maheta
