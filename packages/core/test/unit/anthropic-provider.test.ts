import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  ConfigurationError,
  accumulateModelStream,
  assistantMessage,
  systemMessage,
  toolMessage,
  userMessage,
  type ModelRequest,
} from "../../src";
import { AnthropicProvider } from "../../src/providers/anthropic-provider";

function fakeClient(create: (params: Record<string, unknown>) => unknown): Anthropic {
  return { messages: { create } } as unknown as Anthropic;
}

function baseRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return { messages: [], tools: [], metadata: {}, ...overrides };
}

test("AnthropicProvider.generate maps system/user messages, tools, and the response back", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "msg_1",
      content: [{ type: "text", text: "hi there" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  });

  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });
  const response = await provider.generate(
    baseRequest({
      messages: [systemMessage("Be nice."), userMessage("Hello")],
      tools: [
        {
          name: "get_weather",
          description: "Looks up the weather.",
          schema: z.object({ city: z.string() }),
          metadata: {},
        },
      ],
    }),
  );

  assert.equal(captured.model, "claude-3-5-sonnet-latest");
  assert.equal(captured.max_tokens, 4096);
  assert.equal(captured.stream, false);
  assert.equal(captured.system, "Be nice.");
  assert.deepEqual(captured.messages, [{ role: "user", content: "Hello" }]);
  assert.deepEqual(captured.tools, [
    {
      name: "get_weather",
      description: "Looks up the weather.",
      input_schema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
        additionalProperties: false,
      },
    },
  ]);

  assert.equal(response.content, "hi there");
  assert.equal(response.finishReason, "end_turn");
  assert.deepEqual(response.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
});

test("AnthropicProvider merges consecutive tool results into one user message with multiple tool_result blocks", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "msg_2",
      content: [{ type: "text", text: "done" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  });

  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });
  await provider.generate(
    baseRequest({
      messages: [
        userMessage("add 1+2 and 3+4"),
        assistantMessage("", [
          { id: "call_1", name: "add", arguments: { a: 1, b: 2 } },
          { id: "call_2", name: "add", arguments: { a: 3, b: 4 } },
        ]),
        toolMessage("add", "call_1", "3"),
        toolMessage("add", "call_2", "7"),
      ],
    }),
  );

  const messages = captured.messages as unknown[];
  assert.deepEqual(messages[1], {
    role: "assistant",
    content: [
      { type: "tool_use", id: "call_1", name: "add", input: { a: 1, b: 2 } },
      { type: "tool_use", id: "call_2", name: "add", input: { a: 3, b: 4 } },
    ],
  });
  assert.deepEqual(messages[2], {
    role: "user",
    content: [
      { type: "tool_result", tool_use_id: "call_1", content: "3" },
      { type: "tool_result", tool_use_id: "call_2", content: "7" },
    ],
  });
});

test("AnthropicProvider maps tool_use blocks in the response into ToolCalls", async () => {
  const client = fakeClient(() => ({
    id: "msg_3",
    content: [{ type: "tool_use", id: "call_1", name: "add", input: { a: 1, b: 2 } }],
    stop_reason: "tool_use",
    usage: { input_tokens: 4, output_tokens: 6 },
  }));

  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });
  const response = await provider.generate(baseRequest({ messages: [userMessage("add 1 and 2")] }));

  assert.deepEqual(response.toolCalls, [{ id: "call_1", name: "add", arguments: { a: 1, b: 2 } }]);
  assert.equal(response.content, "");
});

test("AnthropicProvider maps user message images into content blocks (url and data URI)", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "msg_4",
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  });

  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });
  await provider.generate(
    baseRequest({
      messages: [
        userMessage("what is this?", undefined, [
          { url: "https://example.com/cat.png" },
          { url: "data:image/png;base64,QUJD" },
        ]),
      ],
    }),
  );

  const messages = captured.messages as unknown[];
  assert.deepEqual(messages[0], {
    role: "user",
    content: [
      { type: "text", text: "what is this?" },
      { type: "image", source: { type: "url", url: "https://example.com/cat.png" } },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
    ],
  });
});

test("AnthropicProvider forces a synthetic tool for json_schema responseFormat and unwraps it into content", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "msg_5",
      content: [{ type: "tool_use", id: "call_1", name: "answer", input: { result: 42 } }],
      stop_reason: "tool_use",
      usage: { input_tokens: 2, output_tokens: 3 },
    };
  });

  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });
  const response = await provider.generate(
    baseRequest({
      messages: [userMessage("what is the answer?")],
      responseFormat: {
        type: "json_schema",
        name: "answer",
        schema: { type: "object", properties: { result: { type: "number" } } },
      },
    }),
  );

  assert.deepEqual(captured.tools, [
    {
      name: "answer",
      description: "Structured output schema for the final response.",
      input_schema: { type: "object", properties: { result: { type: "number" } } },
    },
  ]);
  assert.deepEqual(captured.tool_choice, { type: "tool", name: "answer" });
  assert.equal(response.content, '{"result":42}');
  assert.equal(response.toolCalls, undefined);
});

test("AnthropicProvider throws ConfigurationError when responseFormat name collides with a real tool", async () => {
  const client = fakeClient(() => ({
    id: "x",
    content: [],
    stop_reason: "end_turn",
    usage: { input_tokens: 0, output_tokens: 0 },
  }));
  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });

  await assert.rejects(
    () =>
      provider.generate(
        baseRequest({
          messages: [userMessage("hi")],
          tools: [{ name: "answer", description: "d", schema: z.object({}), metadata: {} }],
          responseFormat: { type: "json_schema", name: "answer", schema: {} },
        }),
      ),
    ConfigurationError,
  );
});

async function* fakeStreamEvents(): AsyncGenerator<Anthropic.Messages.RawMessageStreamEvent> {
  yield {
    type: "message_start",
    message: {
      id: "msg_6",
      content: [],
      model: "claude-3-5-sonnet-latest",
      role: "assistant",
      stop_reason: null,
      stop_sequence: null,
      type: "message",
      usage: {
        input_tokens: 3,
        output_tokens: 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        cache_creation: null,
        service_tier: null,
      },
    },
  };
  yield {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  } as Anthropic.Messages.RawMessageStreamEvent;
  yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } };
  yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } };
  yield { type: "content_block_stop", index: 0 };
  yield {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "call_1", name: "add", input: {} },
  };
  yield {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"a":' },
  };
  yield {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: "1}" },
  };
  yield { type: "content_block_stop", index: 1 };
  yield {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: {
      input_tokens: null,
      output_tokens: 7,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
    },
  };
  yield { type: "message_stop" };
}

test("AnthropicProvider.stream maps text and tool-use deltas, carrying id/name across fragments", async () => {
  const client = fakeClient((params) => {
    assert.equal(params.stream, true);
    return fakeStreamEvents();
  });

  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });
  const chunks = [];
  for await (const chunk of provider.stream(baseRequest({ messages: [userMessage("hi")] }))) {
    chunks.push(chunk);
  }

  const text = chunks.map((chunk) => chunk.delta).join("");
  assert.equal(text, "Hello");

  const toolDeltas = chunks
    .filter((chunk) => chunk.toolCallDelta)
    .map((chunk) => chunk.toolCallDelta!);
  assert.equal(toolDeltas[0]?.id, "call_1");
  assert.equal(toolDeltas[0]?.name, "add");
  assert.equal(toolDeltas[1]?.id, "call_1", "id carried forward on argument-only fragments");
  assert.equal(toolDeltas.map((delta) => delta.arguments).join(""), '{"a":1}');

  const last = chunks[chunks.length - 1];
  assert.equal(last?.done, true);
  assert.deepEqual(last?.usage, { inputTokens: 3, outputTokens: 7, totalTokens: 10 });
});

test("AnthropicProvider.stream composes with accumulateModelStream into a full ModelResponse", async () => {
  const client = fakeClient(() => fakeStreamEvents());
  const provider = new AnthropicProvider({ model: "claude-3-5-sonnet-latest", client });

  const generator = accumulateModelStream(
    provider.stream(baseRequest({ messages: [userMessage("hi")] })),
  );
  let text = "";
  let step = await generator.next();
  while (!step.done) {
    text += step.value.delta;
    step = await generator.next();
  }

  assert.equal(text, "Hello");
  assert.deepEqual(step.value.toolCalls, [{ id: "call_1", name: "add", arguments: '{"a":1}' }]);
  assert.deepEqual(step.value.usage, { inputTokens: 3, outputTokens: 7, totalTokens: 10 });
});

test("AnthropicProvider capability flags", () => {
  const provider = new AnthropicProvider({
    model: "claude-3-5-sonnet-latest",
    client: fakeClient(() => ({})),
  });
  assert.equal(provider.supportsTools(), true);
  assert.equal(provider.supportsStructuredOutput(), true);
  assert.equal(provider.supportsImages(), true);
  assert.equal(provider.supportsAudio(), false);
});
