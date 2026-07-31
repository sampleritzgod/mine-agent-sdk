import test from "node:test";
import assert from "node:assert/strict";
import {
  Agent,
  EventBus,
  GuardrailError,
  ScriptedProvider,
  type GuardrailTriggeredEvent,
} from "../../src";

test("AgentRuntime emits guardrail.triggered and fails the run when input is blocked", async () => {
  const events = new EventBus();
  let triggered: GuardrailTriggeredEvent | undefined;
  events.on("guardrail.triggered", payload => {
    triggered = payload;
  });

  const agent = new Agent({
    name: "guarded",
    provider: new ScriptedProvider([{ id: "never", content: "should not run" }]),
    eventBus: events,
    guardrails: [
      {
        name: "block-secret",
        phase: "input",
        execute(value) {
          return {
            allowed: !JSON.stringify(value).includes("secret"),
            reason: "Secret input is not allowed.",
          };
        },
      },
    ],
  });

  await assert.rejects(() => agent.run("this contains secret"), GuardrailError);
  assert.equal(triggered?.name, "block-secret");
  assert.equal(triggered?.phase, "input");
});
