import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolExecutor, createTool } from "../../src";

test("ToolExecutor fails cleanly when tool call arguments are not valid JSON", async () => {
  const echo = createTool({
    name: "echo",
    description: "Echoes input.",
    schema: z.object({ value: z.string() }),
    timeout: 1_000,
    retry: { attempts: 2 },
    metadata: {},
    execute(input) {
      return input.value;
    },
  });

  const result = await new ToolExecutor().execute(echo, {
    runId: "run_1",
    toolCall: { id: "call_1", name: "echo", arguments: "{not valid json" },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, "tool_input_error");
  assert.match(result.error?.message ?? "", /malformed JSON/);
  // Malformed input fails fast, without burning through the retry policy.
  assert.equal(result.timing.attempts, 1);
});

test("ToolExecutor fails cleanly when tool call arguments miss required fields", async () => {
  const echo = createTool({
    name: "echo",
    description: "Echoes input.",
    schema: z.object({ value: z.string() }),
    timeout: 1_000,
    retry: { attempts: 2 },
    metadata: {},
    execute(input) {
      return input.value;
    },
  });

  const result = await new ToolExecutor().execute(echo, {
    runId: "run_1",
    toolCall: { id: "call_1", name: "echo", arguments: {} },
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.code, "tool_input_error");
  assert.match(result.error?.message ?? "", /Invalid input/);
});
