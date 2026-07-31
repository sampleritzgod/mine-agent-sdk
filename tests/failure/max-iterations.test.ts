import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Agent, MaxIterationsError, ScriptedProvider, createTool } from "../../src";

test("AgentRuntime fails clearly when a model keeps asking for tools", async () => {
  const noop = createTool({
    name: "noop",
    description: "Returns ok.",
    schema: z.object({}),
    timeout: 1_000,
    retry: { attempts: 1 },
    metadata: {},
    execute() {
      return "ok";
    },
  });

  const provider = new ScriptedProvider([
    { id: "m1", content: "", toolCalls: [{ id: "c1", name: "noop", arguments: {} }] },
    { id: "m2", content: "", toolCalls: [{ id: "c2", name: "noop", arguments: {} }] },
  ]);

  const agent = new Agent({
    name: "looping",
    provider,
    tools: [noop],
    maxIterations: 2,
  });

  await assert.rejects(() => agent.run("loop"), MaxIterationsError);
});
