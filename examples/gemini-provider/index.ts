import { z } from "zod";
import { Agent, createTool } from "mine-agent-sdk";
import { GeminiProvider } from "mine-agent-sdk/providers/gemini";

/**
 * Runs a real request against the Gemini API. Requires GEMINI_API_KEY (or
 * GOOGLE_API_KEY) and the optional `@google/genai` peer dependency installed.
 */
async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.log(
      "Set GEMINI_API_KEY (or GOOGLE_API_KEY) to run this example against the real Gemini API.",
    );
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
    name: "gemini-agent",
    instructions: "Use tools when they help. Be concise.",
    provider: new GeminiProvider({ model: "gemini-2.5-flash" }),
    tools: [add],
  });

  const result = await agent.run("What is 7 plus 8?");
  console.log(result.output);
}

void main();
