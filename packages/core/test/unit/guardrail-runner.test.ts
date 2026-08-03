import test from "node:test";
import assert from "node:assert/strict";
import { EventBus, GuardrailRunner, type GuardrailModifiedEvent } from "../../src";

test("GuardrailRunner returns the original value when nothing modifies it", async () => {
  const runner = new GuardrailRunner([
    { name: "noop", phase: "input", execute: () => ({ allowed: true }) },
  ]);

  const result = await runner.check("input", "hello", "run_1");
  assert.equal(result, "hello");
});

test("GuardrailRunner substitutes a guardrail's replacement value", async () => {
  const events = new EventBus();
  const modified: GuardrailModifiedEvent[] = [];
  events.on("guardrail.modified", (event) => modified.push(event));

  const runner = new GuardrailRunner(
    [
      {
        name: "redact-secret",
        phase: "input",
        execute: (value) => ({
          allowed: true,
          value: String(value).replace("secret", "[redacted]"),
        }),
      },
    ],
    { events },
  );

  const result = await runner.check("input", "this contains secret", "run_1");

  assert.equal(result, "this contains [redacted]");
  assert.equal(modified.length, 1);
  assert.equal(modified[0]?.name, "redact-secret");
  assert.equal(modified[0]?.phase, "input");
});

test("GuardrailRunner chains modifications through multiple guardrails in order", async () => {
  const runner = new GuardrailRunner([
    {
      name: "upper",
      phase: "output",
      execute: (value) => ({ allowed: true, value: String(value).toUpperCase() }),
    },
    {
      name: "exclaim",
      phase: "output",
      execute: (value) => ({ allowed: true, value: `${String(value)}!` }),
    },
  ]);

  const result = await runner.check("output", "done", "run_1");
  assert.equal(result, "DONE!");
});

test("GuardrailRunner still blocks even when an earlier guardrail modified the value", async () => {
  const runner = new GuardrailRunner([
    {
      name: "rewrite",
      phase: "output",
      execute: (value) => ({ allowed: true, value: `${String(value)}-rewritten` }),
    },
    { name: "block", phase: "output", execute: () => ({ allowed: false, reason: "not allowed" }) },
  ]);

  await assert.rejects(() => runner.check("output", "done", "run_1"), /not allowed/);
});
