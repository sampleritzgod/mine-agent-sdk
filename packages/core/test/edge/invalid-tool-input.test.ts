import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Agent, ScriptedProvider, createTool } from "../../src";

test("AgentRuntime stores invalid tool input as a failed tool result and continues", async () => {
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

  const provider = new ScriptedProvider([
    { id: "m1", content: "", toolCalls: [{ id: "bad", name: "add", arguments: { a: "x", b: 1 } }] },
    (request) => {
      const last = request.messages[request.messages.length - 1];
      assert.equal(last?.role, "tool");
      assert.match(last?.content ?? "", /Invalid input/);
      return { id: "m2", content: "I could not use that tool input." };
    },
  ]);

  const result = await new Agent({
    name: "edge",
    provider,
    tools: [add],
  }).run("bad add");

  assert.equal(result.output, "I could not use that tool input.");
  assert.equal(result.trace.toolCalls, 1);
  assert.equal(result.trace.errors.length, 1);
});
