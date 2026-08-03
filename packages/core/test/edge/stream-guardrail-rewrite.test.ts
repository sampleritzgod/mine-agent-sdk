import test from "node:test";
import assert from "node:assert/strict";
import {
  Agent,
  InMemoryStorageAdapter,
  SessionManager,
  SessionMemory,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
} from "../../src";

/**
 * Output guardrails only see the fully accumulated text, so a rewrite lands
 * in the terminal "completed" event and in persisted session history — the
 * chunks already streamed to the caller keep the original, unredacted text.
 * This test documents that ordering rather than asserting a fix for it.
 */
class SecretStreamingProvider implements ModelProvider {
  readonly id = "secret-stream";
  readonly model = "secret-stream-model";

  async generate(_request: ModelRequest): Promise<ModelResponse> {
    return { id: "1", content: "the secret is hunter2" };
  }

  async *stream(_request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    yield { id: "1", delta: "the secret is ", done: false };
    yield { id: "1", delta: "hunter2", done: true };
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return false;
  }

  supportsImages(): boolean {
    return false;
  }

  supportsAudio(): boolean {
    return false;
  }
}

test("an output guardrail rewrite reaches the completed event and persisted session, not already-streamed chunks", async () => {
  const storage = new InMemoryStorageAdapter();
  const memory = new SessionMemory(new SessionManager(storage));

  const agent = new Agent({
    name: "redacting-stream-agent",
    provider: new SecretStreamingProvider(),
    memory,
    guardrails: [
      {
        name: "redact-secret",
        phase: "output",
        execute(value) {
          return { allowed: true, value: String(value).replace("hunter2", "[redacted]") };
        },
      },
    ],
  });

  const deltas: string[] = [];
  let completedOutput: string | undefined;

  for await (const event of agent.stream("what's the secret?", { sessionId: "thread-1" })) {
    if (event.type === "chunk") {
      deltas.push(event.delta);
    } else {
      completedOutput = event.result.output;
    }
  }

  assert.equal(deltas.join(""), "the secret is hunter2");
  assert.equal(completedOutput, "the secret is [redacted]");

  const persisted = await memory.loadMessages("thread-1");
  const assistantMessage = persisted.find((message) => message.role === "assistant");
  assert.equal(assistantMessage?.content, "the secret is [redacted]");
});
