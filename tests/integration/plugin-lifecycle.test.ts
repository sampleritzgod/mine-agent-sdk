import test from "node:test";
import assert from "node:assert/strict";
import { Agent, ScriptedProvider, type AgentPlugin } from "../../src";

test("Agent.create runs plugin setup then init, and agent.teardown runs plugin teardown", async () => {
  const calls: string[] = [];

  const auditPlugin: AgentPlugin = {
    name: "audit",
    setup(ctx) {
      calls.push("audit.setup");
      ctx.registerGuardrail({
        name: "no-empty-output",
        phase: "output",
        execute: value => ({ allowed: String(value).length > 0 }),
      });
    },
    init(ctx) {
      calls.push("audit.init");
      assert.equal(ctx.guardrails.length, 1);
    },
    teardown() {
      calls.push("audit.teardown");
    },
  };

  const provider = new ScriptedProvider([{ id: "m1", content: "hello" }]);
  const agent = await Agent.create({
    name: "plugged",
    provider,
    plugins: [auditPlugin],
  });

  assert.deepEqual(calls, ["audit.setup", "audit.init"]);

  const result = await agent.run("hi");
  assert.equal(result.output, "hello");

  await agent.teardown();
  assert.deepEqual(calls, ["audit.setup", "audit.init", "audit.teardown"]);
});
