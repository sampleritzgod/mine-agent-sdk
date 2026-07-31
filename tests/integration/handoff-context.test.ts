import test from "node:test";
import assert from "node:assert/strict";
import { Agent, ScriptedProvider, type Message } from "../../src";

test("handoff transfers the full conversation to the receiving agent, without leaking the caller's own instructions", async () => {
  let billingReceivedMessages: Message[] = [];

  const billingProvider = new ScriptedProvider([
    request => {
      billingReceivedMessages = request.messages;
      return { id: "billing_1", content: "Your balance is $42." };
    },
  ]);

  const frontDeskProvider = new ScriptedProvider([
    {
      id: "front_1",
      content: "",
      handoff: { target: "billing", input: "route this", reason: "billing question" },
    },
  ]);

  const frontDesk = new Agent({
    name: "front-desk",
    instructions: "You are the front desk. Route billing questions.",
    provider: frontDeskProvider,
    handoffs: [
      {
        name: "billing",
        description: "Handles billing questions.",
        metadata: {},
        async execute(_request, context) {
          const billingAgent = new Agent({
            name: "billing-agent",
            instructions: "You are the billing specialist.",
            provider: billingProvider,
          });
          const result = await billingAgent.run(context.messages);
          return { output: result.output };
        },
      },
    ],
  });

  const result = await frontDesk.run("What is my account balance?");

  assert.equal(result.output, "Your balance is $42.");

  const userMessage = billingReceivedMessages.find(message => message.role === "user");
  assert.equal(userMessage?.content, "What is my account balance?");

  const leakedFrontDeskInstructions = billingReceivedMessages.filter(
    message => message.role === "system" && message.content.includes("front desk"),
  );
  assert.equal(leakedFrontDeskInstructions.length, 0);

  const billingSystemMessages = billingReceivedMessages.filter(message => message.role === "system");
  assert.equal(billingSystemMessages.length, 1);
  assert.match(billingSystemMessages[0]?.content ?? "", /billing specialist/);
});
