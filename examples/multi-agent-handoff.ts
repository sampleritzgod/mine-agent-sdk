import { Agent, ScriptedProvider } from "../src";

async function main(): Promise<void> {
  const billingProvider = new ScriptedProvider([
    request => {
      const userMessage = request.messages.find(message => message.role === "user");
      return {
        id: "billing_1",
        content: `Billing specialist here — regarding "${userMessage?.content}": your balance is $42.00.`,
      };
    },
  ]);

  const frontDeskProvider = new ScriptedProvider([
    {
      id: "front_1",
      content: "",
      handoff: { target: "billing", reason: "This is a billing question." },
    },
  ]);

  const frontDesk = new Agent({
    name: "front-desk",
    instructions: "You are the front desk. Route billing questions to the billing specialist.",
    provider: frontDeskProvider,
    handoffs: [
      {
        name: "billing",
        description: "Handles billing questions with full conversation context.",
        metadata: {},
        async execute(_request, context) {
          const billingAgent = new Agent({
            name: "billing-agent",
            instructions: "You are the billing specialist. Be precise and reference the customer's question.",
            provider: billingProvider,
          });
          const result = await billingAgent.run(context.messages);
          return { output: result.output };
        },
      },
    ],
  });

  const result = await frontDesk.run("What is my account balance?");
  console.log(result.output);
}

void main();
