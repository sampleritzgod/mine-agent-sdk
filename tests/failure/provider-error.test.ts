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

class ExplodingProvider implements ModelProvider {
  readonly id = "exploding";
  readonly model = "exploding-model";

  async generate(_request: ModelRequest): Promise<ModelResponse> {
    throw new Error("upstream is down");
  }

  async *stream(_request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    throw new Error("upstream is down");
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

test("AgentRuntime wraps a provider failure in ProviderError and emits run.failed", async () => {
  const events = new EventBus();
  let failedEvent: RunFailedEvent | undefined;
  events.on("run.failed", event => {
    failedEvent = event;
  });

  const agent = new Agent({
    name: "flaky-provider",
    provider: new ExplodingProvider(),
    eventBus: events,
  });

  await assert.rejects(() => agent.run("hello"), ProviderError);

  assert.equal(failedEvent?.error.code, "provider_error");
  assert.match(failedEvent?.error.message ?? "", /exploding/);
});
