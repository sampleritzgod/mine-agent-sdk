import { z } from "zod";
import { Agent, ScriptedProvider, createTool } from "mine-agent-sdk";

const add = createTool({
  name: "add",
  description: "Adds two numbers.",
  schema: z.object({ a: z.number(), b: z.number() }),
  timeout: 1_000,
  retry: { attempts: 1 },
  metadata: {},
  execute(input) {
    return input.a + input.b;
  },
});

async function main(): Promise<void> {
  const provider = new ScriptedProvider([
    {
      id: "model_1",
      content: "",
      toolCalls: [{ id: "call_1", name: "add", arguments: { a: 7, b: 8 } }],
    },
    { id: "model_2", content: "The answer is 15." },
  ]);

  const agent = new Agent({
    name: "math-agent",
    instructions: "Use tools when they help.",
    provider,
    tools: [add],
  });

  const result = await agent.run("Add 7 and 8.");
  console.log(result.output);
}

void main();
