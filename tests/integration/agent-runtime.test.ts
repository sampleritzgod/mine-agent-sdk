import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  EventBus,
  ScriptedProvider,
  createTool,
  type EventName,
} from "../../src";

test("AgentRuntime executes tool calls iteratively and returns a final answer", async () => {
  const events = new EventBus();
  const seen: EventName[] = [];
  for (const event of [
    "run.started",
    "model.request",
    "model.response",
    "tool.started",
    "tool.finished",
    "run.completed",
  ] as EventName[]) {
    events.on(event, () => seen.push(event));
  }

  const add = createTool({
    name: "add",
    description: "Adds two numbers.",
    schema: z.object({ a: z.number(), b: z.number() }),
    timeout: 1_000,
    retry: { attempts: 1 },
    metadata: { category: "math" },
    execute(input) {
      return input.a + input.b;
    },
  });

  const provider = new ScriptedProvider([
    {
      id: "model_1",
      content: "",
      toolCalls: [{ id: "call_1", name: "add", arguments: { a: 4, b: 6 } }],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.001 },
    },
    request => {
      const last = request.messages[request.messages.length - 1];
      assert.equal(last?.role, "tool");
      return {
        id: "model_2",
        content: `The sum is ${last?.content}.`,
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19, costUsd: 0.0015 },
      };
    },
  ]);

  const agent = new Agent({
    name: "math-agent",
    instructions: "You are careful.",
    provider,
    tools: [add],
    eventBus: events,
  });

  const result = await agent.run("Add 4 and 6.");

  assert.equal(result.output, "The sum is 10.");
  assert.equal(result.trace.toolCalls, 1);
  assert.equal(result.trace.tokens.total, 34);
  assert.equal(result.trace.costUsd, 0.0025);
  assert.deepEqual(seen, [
    "run.started",
    "model.request",
    "model.response",
    "tool.started",
    "tool.finished",
    "model.request",
    "model.response",
    "run.completed",
  ]);
});
