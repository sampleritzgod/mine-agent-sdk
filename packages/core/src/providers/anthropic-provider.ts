import Anthropic from "@anthropic-ai/sdk";
import { ConfigurationError } from "../errors/sdk-error";
import { zodToJsonSchema } from "../tools/zod-json-schema";
import type { AssistantMessage, Message, MessageImagePart, UserMessage } from "../types/message";
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

type AnthropicMessageParam = Anthropic.Messages.MessageParam;
type AnthropicContentBlockParam = Anthropic.Messages.ContentBlockParam;
type AnthropicTool = Anthropic.Messages.Tool;

export interface AnthropicProviderOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
  /** Anthropic requires max_tokens on every request; defaults to 4096. */
  maxTokens?: number;
  /** Inject a pre-built (or fake, for tests) client instead of constructing one from apiKey/baseURL. */
  client?: Anthropic;
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly model: string;
  private readonly maxTokens: number;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 4096;
    this.client =
      options.client ?? new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL });
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const message = await this.client.messages.create({
      ...this.buildParams(request),
      stream: false,
    });

    return fromMessage(message, structuredOutputName(request.responseFormat));
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const events = await this.client.messages.create({
      ...this.buildParams(request),
      stream: true,
    });

    yield* mapAnthropicStream(events, structuredOutputName(request.responseFormat));
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
    const { system, messages } = toAnthropicMessages(request.messages);
    const tools = toAnthropicTools(request.tools);
    const toolChoice = this.applyStructuredOutput(request, tools);

    return {
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      ...(system ? { system } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    };
  }

  /**
   * Anthropic has no native structured-output param; forcing a synthetic tool
   * matching the requested schema (via tool_choice) is the documented way to
   * get schema-conformant output. Mutates `tools` in place and returns the
   * tool_choice to force, or undefined if responseFormat isn't a json_schema.
   */
  private applyStructuredOutput(
    request: ModelRequest,
    tools: AnthropicTool[],
  ): Anthropic.Messages.ToolChoice | undefined {
    if (request.responseFormat?.type !== "json_schema") {
      return undefined;
    }

    const format = request.responseFormat;
    if (request.tools.some((tool) => tool.name === format.name)) {
      throw new ConfigurationError(
        `responseFormat name "${format.name}" collides with a registered tool name.`,
      );
    }

    tools.push({
      name: format.name,
      description: "Structured output schema for the final response.",
      input_schema: format.schema as AnthropicTool["input_schema"],
    });

    return { type: "tool", name: format.name };
  }
}

function structuredOutputName(format: ModelResponseFormat | undefined): string | undefined {
  return format?.type === "json_schema" ? format.name : undefined;
}

function toAnthropicMessages(messages: Message[]): {
  system?: string;
  messages: AnthropicMessageParam[];
} {
  const systemParts: string[] = [];
  const result: AnthropicMessageParam[] = [];
  let toolResultGroup: AnthropicContentBlockParam[] | null = null;

  for (const message of messages) {
    if (message.role !== "tool") {
      toolResultGroup = null;
    }

    switch (message.role) {
      case "system":
        systemParts.push(message.content);
        break;
      case "user":
        result.push({ role: "user", content: toUserContent(message) });
        break;
      case "assistant":
        result.push({ role: "assistant", content: toAssistantContent(message) });
        break;
      case "tool": {
        const block: AnthropicContentBlockParam = {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content,
        };
        if (toolResultGroup) {
          toolResultGroup.push(block);
        } else {
          toolResultGroup = [block];
          result.push({ role: "user", content: toolResultGroup });
        }
        break;
      }
    }
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    messages: result,
  };
}

function toUserContent(message: UserMessage): string | AnthropicContentBlockParam[] {
  if (!message.images || message.images.length === 0) {
    return message.content;
  }

  const blocks: AnthropicContentBlockParam[] = [];
  if (message.content.length > 0) {
    blocks.push({ type: "text", text: message.content });
  }
  for (const image of message.images) {
    blocks.push(toImageBlock(image));
  }
  return blocks;
}

function toImageBlock(image: MessageImagePart): AnthropicContentBlockParam {
  const dataUriMatch = /^data:([^;]+);base64,(.+)$/s.exec(image.url);
  if (dataUriMatch) {
    const [, mediaType, data] = dataUriMatch;
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as Anthropic.Messages.Base64ImageSource["media_type"],
        data: data ?? "",
      },
    };
  }

  return { type: "image", source: { type: "url", url: image.url } };
}

function toAssistantContent(message: AssistantMessage): string | AnthropicContentBlockParam[] {
  if (!message.toolCalls || message.toolCalls.length === 0) {
    return message.content;
  }

  const blocks: AnthropicContentBlockParam[] = [];
  if (message.content.length > 0) {
    blocks.push({ type: "text", text: message.content });
  }
  for (const call of message.toolCalls) {
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: normalizeToolInput(call.arguments),
    });
  }
  return blocks;
}

function normalizeToolInput(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (args as Record<string, unknown> | undefined) ?? {};
}

function toAnthropicTools(tools: ProviderToolDefinition[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // ProviderToolDefinition.schema is `unknown` at the type level to keep the runtime
    // provider-agnostic, but every tool built via createTool() sets it to a zod schema.
    input_schema: zodToJsonSchema(tool.schema as z.ZodTypeAny) as AnthropicTool["input_schema"],
  }));
}

function fromMessage(
  message: Anthropic.Messages.Message,
  structuredName: string | undefined,
): ModelResponse {
  let content = "";
  const toolCalls: ToolCall[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "tool_use") {
      if (block.name === structuredName) {
        content += JSON.stringify(block.input);
      } else {
        toolCalls.push({ id: block.id, name: block.name, arguments: block.input });
      }
    }
  }

  return {
    id: message.id,
    content,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(message.stop_reason ? { finishReason: message.stop_reason } : {}),
    usage: fromUsage(message.usage),
    raw: message,
  };
}

function fromUsage(usage: Anthropic.Messages.Usage): ModelUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
  };
}

async function* mapAnthropicStream(
  events: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>,
  structuredName: string | undefined,
): AsyncGenerator<ModelStreamChunk> {
  const blockKinds = new Map<number, "text" | "tool_use" | "structured">();
  const toolMeta = new Map<number, { id: string; name: string }>();
  let messageId = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for await (const event of events) {
    switch (event.type) {
      case "message_start":
        messageId = event.message.id;
        inputTokens = event.message.usage.input_tokens;
        outputTokens = event.message.usage.output_tokens;
        break;

      case "content_block_start": {
        const block = event.content_block;
        if (block.type === "text") {
          blockKinds.set(event.index, "text");
        } else if (block.type === "tool_use") {
          blockKinds.set(event.index, block.name === structuredName ? "structured" : "tool_use");
          toolMeta.set(event.index, { id: block.id, name: block.name });
        }
        break;
      }

      case "content_block_delta": {
        const kind = blockKinds.get(event.index);
        if (event.delta.type === "text_delta" && kind === "text") {
          yield { id: messageId, delta: event.delta.text, done: false };
        } else if (event.delta.type === "input_json_delta") {
          if (kind === "structured") {
            yield { id: messageId, delta: event.delta.partial_json, done: false };
          } else if (kind === "tool_use") {
            const meta = toolMeta.get(event.index);
            yield {
              id: messageId,
              delta: "",
              done: false,
              toolCallDelta: {
                ...(meta ? { id: meta.id, name: meta.name } : {}),
                arguments: event.delta.partial_json,
              },
            };
          }
        }
        break;
      }

      case "message_delta":
        outputTokens = event.usage.output_tokens;
        break;

      case "message_stop": {
        const usage =
          inputTokens !== undefined && outputTokens !== undefined
            ? { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
            : undefined;
        yield { id: messageId, delta: "", done: true, ...(usage ? { usage } : {}) };
        break;
      }

      case "content_block_stop":
        break;
    }
  }
}
