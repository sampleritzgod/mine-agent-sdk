import { z } from "zod";
import { Agent, createTool } from "../src";
import { AnthropicProvider } from "../src/providers/anthropic-provider";

/**
 * Runs a real request against the Anthropic API. Requires ANTHROPIC_API_KEY
 * and the optional `@anthropic-ai/sdk` peer dependency to be installed.
 */
async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Set ANTHROPIC_API_KEY to run this example against the real Anthropic API.");
    return;
  }

  const add = createTool({
    name: "add",
    description: "Adds two numbers.",
    schema: z.object({ a: z.number(), b: z.number() }),
    timeout: 5_000,
    retry: { attempts: 1 },
    metadata: {},
    execute(input) {
      return input.a + input.b;
    },
  });

  const agent = new Agent({
    name: "anthropic-agent",
    instructions: "Use tools when they help. Be concise.",
    provider: new AnthropicProvider({ model: "claude-3-5-sonnet-latest" }),
    tools: [add],
  });

  const result = await agent.run("What is 7 plus 8?");
  console.log(result.output);
}

void main();
