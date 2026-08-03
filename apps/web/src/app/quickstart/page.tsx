export default function QuickstartPage() {
  return (
    <main
      style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem", fontFamily: "sans-serif" }}
    >
      <h1>Quickstart</h1>
      <pre
        style={{
          background: "#111",
          color: "#eee",
          padding: "1rem",
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        <code>{`import { Agent, ScriptedProvider, createTool } from "mine-agent-sdk";
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

const provider = new ScriptedProvider([
  {
    id: "step_1",
    content: "",
    toolCalls: [{ id: "call_1", name: "add", arguments: { a: 2, b: 3 } }],
  },
  { id: "step_2", content: "The answer is 5." },
]);

const agent = new Agent({
  name: "math-agent",
  instructions: "Be concise and accurate.",
  provider,
  tools: [add],
});

const result = await agent.run("Add 2 and 3.");
console.log(result.output);`}</code>
      </pre>
      <p>
        For real providers (OpenAI, Anthropic, Gemini), see{" "}
        <code>mine-agent-sdk/providers/openai</code>,{" "}
        <code>mine-agent-sdk/providers/anthropic</code>, and{" "}
        <code>mine-agent-sdk/providers/gemini</code>.
      </p>
    </main>
  );
}
