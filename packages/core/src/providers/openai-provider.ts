import OpenAI from "openai";
import { zodToJsonSchema } from "../tools/zod-json-schema";
import type { Message, UserMessage } from "../types/message";
import type {
  ModelRequest,
  ModelResponse,
  ModelResponseFormat,
  ModelStreamChunk,
  ModelUsage,
  ProviderToolDefinition,
  ToolCall,
} from "../types/model";
import type { ModelProvider } from "./model-provider";
import type { z } from "zod";

type ChatMessageParam = OpenAI.Chat.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.ChatCompletionTool;
type ChatResponseFormat = NonNullable<
  OpenAI.Chat.ChatCompletionCreateParamsNonStreaming["response_format"]
>;

export interface OpenAIProviderOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  /** Inject a pre-built (or fake, for tests) client instead of constructing one from apiKey/baseURL/organization. */
  client?: OpenAI;
}

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai";
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        organization: options.organization,
      });
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const completion = await this.client.chat.completions.create({
      ...this.buildParams(request),
      stream: false,
    });

    return fromCompletion(completion);
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const stream = await this.client.chat.completions.create({
      ...this.buildParams(request),
      stream: true,
      stream_options: { include_usage: true },
    });

    const knownToolCalls = new Map<number, { id: string; name: string }>();
    for await (const chunk of stream) {
      yield* mapChunk(chunk, knownToolCalls);
    }
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  supportsImages(): boolean {
    return true;
  }

  supportsAudio(): boolean {
    return false;
  }

  private buildParams(request: ModelRequest) {
    return {
      model: this.model,
      messages: request.messages.map(toChatMessage),
      ...(request.tools.length > 0 ? { tools: toChatTools(request.tools) } : {}),
      ...(request.responseFormat
        ? { response_format: toChatResponseFormat(request.responseFormat) }
        : {}),
    };
  }
}

function toChatMessage(message: Message): ChatMessageParam {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content };
    case "user":
      return { role: "user", content: toUserContent(message) };
    case "assistant":
      return {
        role: "assistant",
        content: message.content.length > 0 ? message.content : null,
        ...(message.toolCalls && message.toolCalls.length > 0
          ? { tool_calls: message.toolCalls.map(toChatToolCall) }
          : {}),
      };
    case "tool":
      return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
  }
}

function toUserContent(
  message: UserMessage,
): OpenAI.Chat.ChatCompletionUserMessageParam["content"] {
  if (!message.images || message.images.length === 0) {
    return message.content;
  }

  return [
    ...(message.content.length > 0 ? [{ type: "text" as const, text: message.content }] : []),
    ...message.images.map((image) => ({
      type: "image_url" as const,
      image_url: { url: image.url },
    })),
  ];
}

function toChatToolCall(call: ToolCall): OpenAI.Chat.ChatCompletionMessageToolCall {
  return {
    id: call.id,
    type: "function",
    function: {
      name: call.name,
      arguments:
        typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments ?? {}),
    },
  };
}

function toChatTools(tools: ProviderToolDefinition[]): ChatTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      // ProviderToolDefinition.schema is `unknown` at the type level to keep the runtime
      // provider-agnostic, but every tool built via createTool() sets it to a zod schema.
      parameters: zodToJsonSchema(tool.schema as z.ZodTypeAny),
    },
  }));
}

function toChatResponseFormat(format: ModelResponseFormat): ChatResponseFormat {
  switch (format.type) {
    case "text":
      return { type: "text" };
    case "json_object":
      return { type: "json_object" };
    case "json_schema":
      return {
        type: "json_schema",
        json_schema: {
          name: format.name,
          schema: format.schema as Record<string, unknown>,
          ...(format.strict !== undefined ? { strict: format.strict } : {}),
        },
      };
  }
}

function fromCompletion(completion: OpenAI.Chat.ChatCompletion): ModelResponse {
  const choice = completion.choices[0];
  const message = choice?.message;
  const toolCalls = fromChatToolCalls(message?.tool_calls);

  return {
    id: completion.id,
    content: message?.content ?? "",
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
    ...(completion.usage ? { usage: fromUsage(completion.usage) } : {}),
    raw: completion,
  };
}

function fromChatToolCalls(
  calls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined,
): ToolCall[] {
  if (!calls) {
    return [];
  }

  return calls
    .filter(
      (call): call is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => call.type === "function",
    )
    .map((call) => ({ id: call.id, name: call.function.name, arguments: call.function.arguments }));
}

function fromUsage(usage: OpenAI.CompletionUsage): ModelUsage {
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

/**
 * Maps one ChatCompletionChunk to zero or more ModelStreamChunks. Multiple
 * parallel tool calls each become their own chunk (ModelStreamChunk carries
 * a single toolCallDelta); knownToolCalls remembers each tool call's id/name
 * by stream index so later argument-only fragments still carry them, since
 * OpenAI only sends id/name on a tool call's first fragment.
 */
function* mapChunk(
  chunk: OpenAI.Chat.ChatCompletionChunk,
  knownToolCalls: Map<number, { id: string; name: string }>,
): Generator<ModelStreamChunk> {
  const choice = chunk.choices[0];
  if (!choice) {
    if (chunk.usage) {
      yield { id: chunk.id, delta: "", done: true, usage: fromUsage(chunk.usage) };
    }
    return;
  }

  const delta = choice.delta;
  const toolCallDeltas = delta.tool_calls ?? [];
  const finished = choice.finish_reason !== null && choice.finish_reason !== undefined;

  if (delta.content) {
    yield { id: chunk.id, delta: delta.content, done: finished && toolCallDeltas.length === 0 };
  }

  for (const toolCallDelta of toolCallDeltas) {
    const known = knownToolCalls.get(toolCallDelta.index);
    const id = toolCallDelta.id ?? known?.id;
    const name = toolCallDelta.function?.name ?? known?.name;
    if (id && name) {
      knownToolCalls.set(toolCallDelta.index, { id, name });
    }

    yield {
      id: chunk.id,
      delta: "",
      done: false,
      toolCallDelta: {
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
        ...(toolCallDelta.function?.arguments !== undefined
          ? { arguments: toolCallDelta.function.arguments }
          : {}),
      },
    };
  }

  if (!delta.content && toolCallDeltas.length === 0 && finished) {
    yield { id: chunk.id, delta: "", done: true };
  }
}
