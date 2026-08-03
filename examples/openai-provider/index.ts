import { z } from "zod";
import { Agent, createTool } from "mine-agent-sdk";
import { OpenAIProvider } from "mine-agent-sdk/providers/openai";

/**
 * Runs a real request against the OpenAI API. Requires OPENAI_API_KEY and
 * the optional `openai` peer dependency to be installed.
 */
async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.log("Set OPENAI_API_KEY to run this example against the real OpenAI API.");
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
    name: "openai-agent",
    instructions: "Use tools when they help. Be concise.",
    provider: new OpenAIProvider({ model: "gpt-4o-mini" }),
    tools: [add],
  });

  const result = await agent.run("What is 7 plus 8?");
  console.log(result.output);
}

void main();
