import test from "node:test";
import assert from "node:assert/strict";
import { Agent, InMemoryStorageAdapter, ScriptedProvider, SessionManager, SessionMemory } from "../../src";

test("input guardrail rewrite reaches the model and output guardrail rewrite reaches the caller and session", async () => {
  const storage = new InMemoryStorageAdapter();
  const memory = new SessionMemory(new SessionManager(storage));

  const provider = new ScriptedProvider([
    request => {
      const last = request.messages[request.messages.length - 1];
      assert.equal(last?.content, "my card number is [redacted]");
      return { id: "model_1", content: "ok, got it: secret-answer" };
    },
  ]);

  const agent = new Agent({
    name: "redacting-agent",
    provider,
    memory,
    guardrails: [
      {
        name: "redact-input",
        phase: "input",
        execute(value) {
          const messages = value as Array<{ content: string }>;
          return {
            allowed: true,
            value: messages.map(message => ({
              ...message,
              content: message.content.replace("4111-1111-1111-1111", "[redacted]"),
            })),
          };
        },
      },
      {
        name: "redact-output",
        phase: "output",
        execute(value) {
          return {
            allowed: true,
            value: String(value).replace("secret-answer", "[redacted]"),
          };
        },
      },
    ],
  });

  const result = await agent.run("my card number is 4111-1111-1111-1111", {
    sessionId: "thread-1",
  });

  assert.equal(result.output, "ok, got it: [redacted]");

  const assistantMessage = result.messages.find(message => message.role === "assistant");
  assert.equal(assistantMessage?.content, "ok, got it: [redacted]");

  const persisted = await memory.loadMessages("thread-1");
  const persistedAssistant = persisted.find(message => message.role === "assistant");
  assert.equal(persistedAssistant?.content, "ok, got it: [redacted]");
});
