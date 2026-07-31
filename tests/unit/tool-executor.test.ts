import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createTool, ToolExecutor } from "../../src";

test("ToolExecutor validates input and returns a success envelope", async () => {
  const tool = createTool({
    name: "add",
    description: "Adds two numbers.",
    schema: z.object({ a: z.number(), b: z.number() }),
    timeout: 1_000,
    retry: { attempts: 1 },
    metadata: {},
    execute(input, context) {
      context.log("adding", input);
      return input.a + input.b;
    },
  });

  const result = await new ToolExecutor().execute(tool, {
    runId: "run_1",
    toolCall: {
      id: "tool_1",
      name: "add",
      arguments: { a: 2, b: 3 },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.result, 5);
  assert.equal(result.error, undefined);
  assert.equal(result.logs.length, 1);
  assert.equal(result.timing.attempts, 1);
});

test("ToolExecutor retries failed executions before succeeding", async () => {
  let attempts = 0;
  const tool = createTool({
    name: "flaky",
    description: "Fails once.",
    schema: z.object({ value: z.string() }),
    timeout: 1_000,
    retry: { attempts: 2, backoffMs: 0 },
    metadata: {},
    execute(input) {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary");
      }
      return input.value.toUpperCase();
    },
  });

  const result = await new ToolExecutor().execute(tool, {
    runId: "run_1",
    toolCall: {
      id: "tool_1",
      name: "flaky",
      arguments: { value: "ok" },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.result, "OK");
  assert.equal(result.timing.attempts, 2);
});
