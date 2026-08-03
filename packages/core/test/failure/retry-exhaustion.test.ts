import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { EventBus, ToolExecutor, createTool, type ToolFailedEvent } from "../../src";

test("ToolExecutor exhausts retries and reports failure with every attempt counted", async () => {
  let attempts = 0;
  const alwaysFails = createTool({
    name: "always-fails",
    description: "Always throws.",
    schema: z.object({}),
    timeout: 1_000,
    retry: { attempts: 3, backoffMs: 0 },
    metadata: {},
    execute() {
      attempts += 1;
      throw new Error(`boom ${attempts}`);
    },
  });

  const events = new EventBus();
  let failedEvent: ToolFailedEvent | undefined;
  events.on("tool.failed", (event) => {
    failedEvent = event;
  });

  const result = await new ToolExecutor({ events }).execute(alwaysFails, {
    runId: "run_1",
    toolCall: { id: "call_1", name: "always-fails", arguments: {} },
  });

  assert.equal(result.success, false);
  assert.equal(attempts, 3);
  assert.equal(result.timing.attempts, 3);
  assert.equal(result.error?.message, "boom 3");
  assert.equal(result.logs.length, 3);
  assert.equal(failedEvent?.result.success, false);
});
