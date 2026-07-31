import test from "node:test";
import assert from "node:assert/strict";
import {
  Agent,
  EventBus,
  ProviderError,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
  type RunFailedEvent,
} from "../../src";

class ExplodingStreamProvider implements ModelProvider {
  readonly id = "exploding-stream";
  readonly model = "exploding-stream-model";

  async generate(_request: ModelRequest): Promise<ModelResponse> {
    return { id: "1", content: "unused" };
  }

  async *stream(_request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    yield { id: "1", delta: "partial ", done: false };
    throw new Error("stream disconnected");
  }

  supportsTools(): boolean {
    return false;
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

test("agent.stream() wraps a mid-stream provider failure in ProviderError and emits run.failed", async () => {
  const events = new EventBus();
  let failedEvent: RunFailedEvent | undefined;
  events.on("run.failed", event => {
    failedEvent = event;
  });

  const agent = new Agent({
    name: "flaky-stream-provider",
    provider: new ExplodingStreamProvider(),
    eventBus: events,
  });

  const deltas: string[] = [];
  await assert.rejects(async () => {
    for await (const event of agent.stream("hello")) {
      if (event.type === "chunk") {
        deltas.push(event.delta);
      }
    }
  }, ProviderError);

  assert.deepEqual(deltas, ["partial "]);
  assert.equal(failedEvent?.error.code, "provider_error");
  assert.match(failedEvent?.error.message ?? "", /exploding-stream/);
});
