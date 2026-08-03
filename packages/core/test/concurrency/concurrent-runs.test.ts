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

class EchoProvider implements ModelProvider {
  readonly id = "echo";
  readonly model = "echo-model";

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const lastUser = [...request.messages].reverse().find((message) => message.role === "user");
    return {
      id: `echo_${lastUser?.content ?? "empty"}`,
      content: `echo:${lastUser?.content ?? ""}`,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const response = await this.generate(request);
    yield { id: response.id, delta: response.content, done: true };
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

test("AgentRuntime can run concurrently with isolated sessions", async () => {
  const storage = new InMemoryStorageAdapter();
  const memory = new SessionMemory(new SessionManager(storage));
  const agent = new Agent({
    name: "echo",
    provider: new EchoProvider(),
    memory,
  });

  const runs = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      agent.run(`message-${index}`, { sessionId: `session-${index}` }),
    ),
  );

  assert.equal(runs.length, 12);
  for (let index = 0; index < runs.length; index += 1) {
    assert.equal(runs[index]?.output, `echo:message-${index}`);
    const messages = await memory.loadMessages(`session-${index}`);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[1]?.role, "assistant");
  }
});
