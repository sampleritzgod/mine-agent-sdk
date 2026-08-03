import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolExecutor, createTool } from "../../src";

test("ToolExecutor fails a tool call that exceeds its timeout", async () => {
  const slow = createTool({
    name: "slow",
    description: "Never finishes in time.",
    schema: z.object({}),
    timeout: 20,
    retry: { attempts: 1 },
    metadata: {},
    execute() {
      // Never settles — the executor's own timeout race must win.
      return new Promise(() => {});
    },
  });

  const result = await new ToolExecutor().execute(slow, {
    runId: "run_1",
    toolCall: { id: "call_1", name: "slow", arguments: {} },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, "tool_timeout");
  assert.equal(result.timing.attempts, 1);
});
