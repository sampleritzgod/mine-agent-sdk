import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { GoogleGenAI } from "@google/genai";
import {
  accumulateModelStream,
  assistantMessage,
  systemMessage,
  toolMessage,
  userMessage,
  type ModelRequest,
} from "../../src";
import { GeminiProvider } from "../../src/providers/gemini-provider";

function fakeResponse(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    text: undefined,
    functionCalls: undefined,
    candidates: [],
    usageMetadata: undefined,
    ...overrides,
  };
}

function fakeClient(
  generateContent: (params: Record<string, unknown>) => unknown,
  generateContentStream?: (params: Record<string, unknown>) => unknown,
): GoogleGenAI {
  return {
    models: {
      generateContent,
      generateContentStream: generateContentStream ?? (() => Promise.resolve((async function* () {})())),
    },
  } as unknown as GoogleGenAI;
}

function baseRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return { messages: [], tools: [], metadata: {}, ...overrides };
}

test("GeminiProvider.generate maps system/user messages, tools, and the response back", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient(params => {
    captured = params;
    return fakeResponse({
      text: "hi there",
      responseId: "resp_1",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    });
  });

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
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

  assert.equal(captured.model, "gemini-2.5-flash");
  const config = captured.config as Record<string, unknown>;
  assert.equal(config.systemInstruction, "Be nice.");
  assert.deepEqual(captured.contents, [{ role: "user", parts: [{ text: "Hello" }] }]);
  assert.deepEqual(config.tools, [
    {
      functionDeclarations: [
        {
          name: "get_weather",
          description: "Looks up the weather.",
          parametersJsonSchema: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
            additionalProperties: false,
          },
        },
      ],
    },
  ]);

  assert.equal(response.content, "hi there");
  assert.equal(response.finishReason, "STOP");
  assert.deepEqual(response.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
});

test("GeminiProvider merges consecutive tool results into one user-role content with multiple functionResponse parts", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient(params => {
    captured = params;
    return fakeResponse({ text: "done" });
  });

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
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

  const contents = captured.contents as unknown[];
  assert.deepEqual(contents[1], {
    role: "model",
    parts: [
      { functionCall: { name: "add", args: { a: 1, b: 2 } } },
      { functionCall: { name: "add", args: { a: 3, b: 4 } } },
    ],
  });
  assert.deepEqual(contents[2], {
    role: "user",
    parts: [
      { functionResponse: { name: "add", response: { output: "3" } } },
      { functionResponse: { name: "add", response: { output: "7" } } },
    ],
  });
});

test("GeminiProvider maps functionCalls from the response into ToolCalls", async () => {
  const client = fakeClient(() =>
    fakeResponse({
      text: "",
      functionCalls: [{ id: "call_1", name: "add", args: { a: 1, b: 2 } }],
    }),
  );

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
  const response = await provider.generate(baseRequest({ messages: [userMessage("add 1 and 2")] }));

  assert.deepEqual(response.toolCalls, [{ id: "call_1", name: "add", arguments: { a: 1, b: 2 } }]);
});

test("GeminiProvider generates a synthetic id when Gemini omits FunctionCall.id", async () => {
  const client = fakeClient(() =>
    fakeResponse({ text: "", functionCalls: [{ name: "add", args: { a: 1, b: 2 } }] }),
  );

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
  const response = await provider.generate(baseRequest({ messages: [userMessage("add 1 and 2")] }));

  assert.equal(response.toolCalls?.length, 1);
  assert.equal(typeof response.toolCalls?.[0]?.id, "string");
  assert.ok((response.toolCalls?.[0]?.id.length ?? 0) > 0);
});

test("GeminiProvider maps user message images into inlineData and fileData parts", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient(params => {
    captured = params;
    return fakeResponse({ text: "ok" });
  });

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
  await provider.generate(
    baseRequest({
      messages: [
        userMessage("what is this?", undefined, [
          { url: "https://example.com/cat.png" },
          { url: "data:image/jpeg;base64,QUJD" },
        ]),
      ],
    }),
  );

  const contents = captured.contents as unknown[];
  assert.deepEqual(contents[0], {
    role: "user",
    parts: [
      { text: "what is this?" },
      { fileData: { fileUri: "https://example.com/cat.png", mimeType: "image/png" } },
      { inlineData: { mimeType: "image/jpeg", data: "QUJD" } },
    ],
  });
});

test("GeminiProvider maps a json_schema responseFormat to native responseMimeType/responseJsonSchema", async () => {
  let captured: Record<string, unknown> = {};
  const client = fakeClient(params => {
    captured = params;
    return fakeResponse({ text: '{"result":42}' });
  });

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
  await provider.generate(
    baseRequest({
      messages: [userMessage("what is the answer?")],
      responseFormat: {
        type: "json_schema",
        name: "answer",
        schema: { type: "object", properties: { result: { type: "number" } } },
      },
    }),
  );

  const config = captured.config as Record<string, unknown>;
  assert.equal(config.responseMimeType, "application/json");
  assert.deepEqual(config.responseJsonSchema, { type: "object", properties: { result: { type: "number" } } });
});

test("GeminiProvider.stream yields incremental text and complete tool-call args per chunk", async () => {
  async function* fakeChunks() {
    yield fakeResponse({ text: "Hel", responseId: "resp_2" });
    yield fakeResponse({ text: "lo", responseId: "resp_2" });
    yield fakeResponse({
      text: "",
      responseId: "resp_2",
      functionCalls: [{ id: "call_1", name: "add", args: { a: 1 } }],
    });
    yield fakeResponse({
      text: "",
      responseId: "resp_2",
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
    });
  }

  const client = fakeClient(
    () => fakeResponse({}),
    () => Promise.resolve(fakeChunks()),
  );

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
  const chunks = [];
  for await (const chunk of provider.stream(baseRequest({ messages: [userMessage("hi")] }))) {
    chunks.push(chunk);
  }

  const text = chunks.map(chunk => chunk.delta).join("");
  assert.equal(text, "Hello");

  const toolDelta = chunks.find(chunk => chunk.toolCallDelta);
  assert.deepEqual(toolDelta?.toolCallDelta, { id: "call_1", name: "add", arguments: { a: 1 } });

  const last = chunks[chunks.length - 1];
  assert.equal(last?.done, true);
  assert.deepEqual(last?.usage, { inputTokens: 3, outputTokens: 4, totalTokens: 7 });
});

test("GeminiProvider.stream composes with accumulateModelStream into a full ModelResponse", async () => {
  async function* fakeChunks() {
    yield fakeResponse({ text: "Hel", responseId: "resp_3" });
    yield fakeResponse({ text: "lo", responseId: "resp_3" });
    yield fakeResponse({
      text: "",
      responseId: "resp_3",
      functionCalls: [{ id: "call_1", name: "add", args: { a: 1 } }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
    });
  }

  const client = fakeClient(
    () => fakeResponse({}),
    () => Promise.resolve(fakeChunks()),
  );

  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client });
  const generator = accumulateModelStream(provider.stream(baseRequest({ messages: [userMessage("hi")] })));
  let text = "";
  let step = await generator.next();
  while (!step.done) {
    text += step.value.delta;
    step = await generator.next();
  }

  assert.equal(text, "Hello");
  assert.deepEqual(step.value.toolCalls, [{ id: "call_1", name: "add", arguments: { a: 1 } }]);
  assert.deepEqual(step.value.usage, { inputTokens: 3, outputTokens: 4, totalTokens: 7 });
});

test("GeminiProvider capability flags", () => {
  const provider = new GeminiProvider({ model: "gemini-2.5-flash", client: fakeClient(() => fakeResponse({})) });
  assert.equal(provider.supportsTools(), true);
  assert.equal(provider.supportsStructuredOutput(), true);
  assert.equal(provider.supportsImages(), true);
  assert.equal(provider.supportsAudio(), false);
});
