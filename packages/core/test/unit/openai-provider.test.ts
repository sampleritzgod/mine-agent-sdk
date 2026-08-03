import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type OpenAI from "openai";
import {
  accumulateModelStream,
  assistantMessage,
  systemMessage,
  toolMessage,
  userMessage,
  type ModelRequest,
} from "../../src";
import { OpenAIProvider } from "../../src/providers/openai-provider";

function fakeClient(create: (params: Record<string, unknown>) => unknown): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

function baseRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return { messages: [], tools: [], metadata: {}, ...overrides };
}

test("OpenAIProvider.generate maps messages/tools to OpenAI params and maps the response back", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "chatcmpl_1",
      choices: [{ message: { role: "assistant", content: "hi there" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  });

  const provider = new OpenAIProvider({ model: "gpt-4o-mini", client });
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

  assert.equal(captured.model, "gpt-4o-mini");
  assert.equal(captured.stream, false);
  assert.deepEqual(captured.messages, [
    { role: "system", content: "Be nice." },
    { role: "user", content: "Hello" },
  ]);
  assert.deepEqual(captured.tools, [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Looks up the weather.",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
          additionalProperties: false,
        },
      },
    },
  ]);

  assert.equal(response.content, "hi there");
  assert.equal(response.finishReason, "stop");
  assert.deepEqual(response.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
});

test("OpenAIProvider round-trips tool-call history and tool results into OpenAI wire format", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "chatcmpl_2",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "add", arguments: '{"a":1}' } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };
  });

  const provider = new OpenAIProvider({ model: "gpt-4o-mini", client });
  const response = await provider.generate(
    baseRequest({
      messages: [
        userMessage("add 1 and 2"),
        assistantMessage("", [{ id: "call_1", name: "add", arguments: { a: 1, b: 2 } }]),
        toolMessage("add", "call_1", "3"),
      ],
    }),
  );

  const messages = captured.messages as unknown[];
  assert.deepEqual(messages[1], {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: "call_1", type: "function", function: { name: "add", arguments: '{"a":1,"b":2}' } },
    ],
  });
  assert.deepEqual(messages[2], { role: "tool", content: "3", tool_call_id: "call_1" });
  assert.deepEqual(response.toolCalls, [{ id: "call_1", name: "add", arguments: '{"a":1}' }]);
});

test("OpenAIProvider maps user message images into multipart content", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "chatcmpl_3",
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    };
  });

  const provider = new OpenAIProvider({ model: "gpt-4o", client });
  await provider.generate(
    baseRequest({
      messages: [userMessage("what is this?", undefined, [{ url: "https://example.com/cat.png" }])],
    }),
  );

  const messages = captured.messages as unknown[];
  assert.deepEqual(messages[0], {
    role: "user",
    content: [
      { type: "text", text: "what is this?" },
      { type: "image_url", image_url: { url: "https://example.com/cat.png" } },
    ],
  });
});

test("OpenAIProvider maps a json_schema responseFormat request", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient((params) => {
    captured = params;
    return {
      id: "chatcmpl_4",
      choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
    };
  });

  const provider = new OpenAIProvider({ model: "gpt-4o-mini", client });
  await provider.generate(
    baseRequest({
      messages: [userMessage("hi")],
      responseFormat: {
        type: "json_schema",
        name: "answer",
        schema: { type: "object" },
        strict: true,
      },
    }),
  );

  assert.deepEqual(captured.response_format, {
    type: "json_schema",
    json_schema: { name: "answer", schema: { type: "object" }, strict: true },
  });
});

async function* fakeToolCallChunks() {
  yield { id: "c1", choices: [{ index: 0, delta: { content: "Hel" }, finish_reason: null }] };
  yield { id: "c1", choices: [{ index: 0, delta: { content: "lo" }, finish_reason: null }] };
  yield {
    id: "c1",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [{ index: 0, id: "call_1", function: { name: "add", arguments: '{"a":' } }],
        },
        finish_reason: null,
      },
    ],
  };
  yield {
    id: "c1",
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: "1}" } }] },
        finish_reason: "tool_calls",
      },
    ],
  };
  yield {
    id: "c1",
    choices: [],
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  };
}

test("OpenAIProvider.stream maps content and tool-call deltas, carrying id/name across fragments", async () => {
  const client = fakeClient((params) => {
    assert.equal(params.stream, true);
    return fakeToolCallChunks();
  });

  const provider = new OpenAIProvider({ model: "gpt-4o-mini", client });
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
  assert.equal(toolDeltas[0]?.arguments, '{"a":');
  assert.equal(toolDeltas[1]?.id, "call_1", "id is carried forward on argument-only fragments");
  assert.equal(toolDeltas[1]?.arguments, "1}");

  const last = chunks[chunks.length - 1];
  assert.equal(last?.done, true);
  assert.deepEqual(last?.usage, { inputTokens: 3, outputTokens: 4, totalTokens: 7 });
});

test("OpenAIProvider.stream composes with accumulateModelStream into a full ModelResponse", async () => {
  const client = fakeClient(() => fakeToolCallChunks());
  const provider = new OpenAIProvider({ model: "gpt-4o-mini", client });

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
  assert.deepEqual(step.value.usage, { inputTokens: 3, outputTokens: 4, totalTokens: 7 });
});

test("OpenAIProvider capability flags", () => {
  const provider = new OpenAIProvider({ model: "gpt-4o-mini", client: fakeClient(() => ({})) });
  assert.equal(provider.supportsTools(), true);
  assert.equal(provider.supportsStructuredOutput(), true);
  assert.equal(provider.supportsImages(), true);
  assert.equal(provider.supportsAudio(), false);
});
