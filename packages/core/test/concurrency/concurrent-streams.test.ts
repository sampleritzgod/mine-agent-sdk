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

class EchoStreamProvider implements ModelProvider {
  readonly id = "echo-stream";
  readonly model = "echo-stream-model";

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const lastUser = [...request.messages].reverse().find((message) => message.role === "user");
    return {
      id: `echo_${lastUser?.content ?? "empty"}`,
      content: `echo:${lastUser?.content ?? ""}`,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const response = await this.generate(request);
    const splitAt = response.content.indexOf(":") + 1;
    yield { id: response.id, delta: response.content.slice(0, splitAt), done: false };
    yield { id: response.id, delta: response.content.slice(splitAt), done: true };
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

test("agent.stream() runs concurrently with isolated sessions and no cross-talk between streams", async () => {
  const storage = new InMemoryStorageAdapter();
  const memory = new SessionMemory(new SessionManager(storage));
  const agent = new Agent({
    name: "echo-stream",
    provider: new EchoStreamProvider(),
    memory,
  });

  const runs = await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const deltas: string[] = [];
      let output: string | undefined;
      for await (const event of agent.stream(`message-${index}`, {
        sessionId: `session-${index}`,
      })) {
        if (event.type === "chunk") {
          deltas.push(event.delta);
        } else {
          output = event.result.output;
        }
      }
      return { index, deltas: deltas.join(""), output };
    }),
  );

  assert.equal(runs.length, 12);
  for (const { index, deltas, output } of runs) {
    assert.equal(output, `echo:message-${index}`);
    assert.equal(deltas, `echo:message-${index}`);
    const messages = await memory.loadMessages(`session-${index}`);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[1]?.role, "assistant");
    assert.equal(messages[1]?.content, `echo:message-${index}`);
  }
});
