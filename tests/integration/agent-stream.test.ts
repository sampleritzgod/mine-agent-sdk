import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  EventBus,
  createTool,
  type AgentStreamChunkEvent,
  type EventName,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
  type RunResult,
} from "../../src";

/** Streams a tool call on the first turn, then a multi-chunk text answer on the second. */
class ChunkedToolProvider implements ModelProvider {
  readonly id = "chunked-tool";
  readonly model = "chunked-tool-model";

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const lastMessage = request.messages[request.messages.length - 1];
    if (lastMessage?.role !== "tool") {
      return {
        id: "model_1",
        content: "",
        toolCalls: [{ id: "call_1", name: "add", arguments: { a: 4, b: 6 } }],
        usage: { totalTokens: 10 },
      };
    }

    return { id: "model_2", content: `The sum is ${lastMessage.content}.`, usage: { totalTokens: 19 } };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const lastMessage = request.messages[request.messages.length - 1];

    if (lastMessage?.role !== "tool") {
      yield {
        id: "model_1",
        delta: "",
        toolCallDelta: { id: "call_1", name: "add" },
        done: false,
      };
      yield { id: "model_1", delta: "", toolCallDelta: { arguments: "{\"a\":4," }, done: false };
      yield { id: "model_1", delta: "", toolCallDelta: { arguments: "\"b\":6}" }, done: false };
      yield { id: "model_1", delta: "", done: true, usage: { totalTokens: 10 } };
      return;
    }

    const words = [`The`, `sum`, `is`, `${lastMessage.content}.`];
    for (let i = 0; i < words.length; i += 1) {
      const isLast = i === words.length - 1;
      yield {
        id: "model_2",
        delta: i === 0 ? words[i]! : ` ${words[i]}`,
        done: isLast,
        ...(isLast ? { usage: { totalTokens: 19 } } : {}),
      };
    }
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  supportsImages(): boolean {
    return false;
  }

  supportsAudio(): boolean {
    return false;
  }
}

test("agent.stream() drives the same tool loop as agent.run() and yields text as it arrives", async () => {
  const events = new EventBus();
  const seen: EventName[] = [];
  for (const event of [
    "run.started",
    "model.request",
    "model.response",
    "tool.started",
    "tool.finished",
    "run.completed",
  ] as EventName[]) {
    events.on(event, () => seen.push(event));
  }

  const add = createTool({
    name: "add",
    description: "Adds two numbers.",
    schema: z.object({ a: z.number(), b: z.number() }),
    timeout: 1_000,
    retry: { attempts: 1 },
    metadata: {},
    execute(input) {
      return input.a + input.b;
    },
  });

  const agent = new Agent({
    name: "math-agent",
    provider: new ChunkedToolProvider(),
    tools: [add],
    eventBus: events,
  });

  const chunkEvents: AgentStreamChunkEvent[] = [];
  let completedResult: RunResult | undefined;

  for await (const event of agent.stream("Add 4 and 6.")) {
    if (event.type === "chunk") {
      chunkEvents.push(event);
    } else {
      completedResult = event.result;
    }
  }

  assert.ok(completedResult, "expected a completed event");
  assert.equal(completedResult?.output, "The sum is 10.");
  assert.equal(completedResult?.trace.toolCalls, 1);
  assert.equal(completedResult?.trace.tokens.total, 29);

  // The first (tool-call) turn has no text content, so it yields no chunks.
  assert.equal(chunkEvents.every(chunk => chunk.iteration === 2), true);
  assert.deepEqual(chunkEvents.map(chunk => chunk.delta), ["The", " sum", " is", " 10."]);
  assert.equal(chunkEvents.map(chunk => chunk.delta).join(""), "The sum is 10.");
  assert.ok(chunkEvents.every(chunk => chunk.runId === completedResult?.runId));

  assert.deepEqual(seen, [
    "run.started",
    "model.request",
    "model.response",
    "tool.started",
    "tool.finished",
    "model.request",
    "model.response",
    "run.completed",
  ]);
});

test("agent.stream() and agent.run() produce identical RunResults for the same scripted conversation", async () => {
  const add = createTool({
    name: "add",
    description: "Adds two numbers.",
    schema: z.object({ a: z.number(), b: z.number() }),
    timeout: 1_000,
    retry: { attempts: 1 },
    metadata: {},
    execute(input) {
      return input.a + input.b;
    },
  });

  const makeAgent = () => new Agent({
    name: "math-agent",
    provider: new ChunkedToolProvider(),
    tools: [add],
  });

  const runResult = await makeAgent().run("Add 4 and 6.");

  let streamedResult: RunResult | undefined;
  for await (const event of makeAgent().stream("Add 4 and 6.")) {
    if (event.type === "completed") {
      streamedResult = event.result;
    }
  }

  assert.equal(streamedResult?.output, runResult.output);
  assert.equal(streamedResult?.trace.toolCalls, runResult.trace.toolCalls);
  assert.equal(streamedResult?.trace.tokens.total, runResult.trace.tokens.total);
  assert.deepEqual(
    streamedResult?.messages.map(message => ({ role: message.role, content: message.content })),
    runResult.messages.map(message => ({ role: message.role, content: message.content })),
  );
});
