import { GoogleGenAI } from "@google/genai";
import type {
  Content,
  FunctionDeclaration,
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
  Part,
} from "@google/genai";
import { zodToJsonSchema } from "../tools/zod-json-schema";
import { createId } from "../utils/id";
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

export interface GeminiProviderOptions {
  model: string;
  /** Defaults to the GEMINI_API_KEY or GOOGLE_API_KEY environment variable. */
  apiKey?: string;
  /** Inject a pre-built (or fake, for tests) client instead of constructing one from apiKey. */
  client?: GoogleGenAI;
}

export class GeminiProvider implements ModelProvider {
  readonly id = "gemini";
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.client =
      options.client ?? new GoogleGenAI({ ...(options.apiKey ? { apiKey: options.apiKey } : {}) });
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.models.generateContent(this.buildParams(request));
    return fromResponse(response);
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const stream = await this.client.models.generateContentStream(this.buildParams(request));
    yield* mapGeminiStream(stream);
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

  private buildParams(request: ModelRequest): GenerateContentParameters {
    const { systemInstruction, contents } = toGeminiContents(request.messages);
    const config: GenerateContentConfig = {
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(request.tools.length > 0
        ? { tools: [{ functionDeclarations: toFunctionDeclarations(request.tools) }] }
        : {}),
    };
    applyResponseFormat(config, request.responseFormat);

    return { model: this.model, contents, config };
  }
}

function applyResponseFormat(
  config: GenerateContentConfig,
  format: ModelResponseFormat | undefined,
): void {
  if (!format || format.type === "text") {
    return;
  }

  config.responseMimeType = "application/json";
  if (format.type === "json_schema") {
    config.responseJsonSchema = format.schema;
  }
}

function toGeminiContents(messages: Message[]): {
  systemInstruction?: string;
  contents: Content[];
} {
  const systemParts: string[] = [];
  const contents: Content[] = [];
  let toolResponseGroup: Part[] | null = null;

  for (const message of messages) {
    if (message.role !== "tool") {
      toolResponseGroup = null;
    }

    switch (message.role) {
      case "system":
        systemParts.push(message.content);
        break;
      case "user":
        contents.push({ role: "user", parts: toUserParts(message) });
        break;
      case "assistant":
        contents.push({ role: "model", parts: toAssistantParts(message) });
        break;
      case "tool": {
        const part: Part = {
          functionResponse: { name: message.name, response: { output: message.content } },
        };
        if (toolResponseGroup) {
          toolResponseGroup.push(part);
        } else {
          toolResponseGroup = [part];
          contents.push({ role: "user", parts: toolResponseGroup });
        }
        break;
      }
    }
  }

  return {
    ...(systemParts.length > 0 ? { systemInstruction: systemParts.join("\n\n") } : {}),
    contents,
  };
}

function toUserParts(message: UserMessage): Part[] {
  const parts: Part[] = [];
  if (message.content.length > 0) {
    parts.push({ text: message.content });
  }
  for (const image of message.images ?? []) {
    parts.push(toImagePart(image));
  }
  return parts;
}

function toImagePart(image: MessageImagePart): Part {
  const dataUriMatch = /^data:([^;]+);base64,(.+)$/s.exec(image.url);
  if (dataUriMatch) {
    const [, mimeType, data] = dataUriMatch;
    return { inlineData: { mimeType: mimeType ?? "image/png", data: data ?? "" } };
  }

  return { fileData: { fileUri: image.url, mimeType: guessMimeType(image.url) } };
}

function guessMimeType(url: string): string {
  const extension = url.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function toAssistantParts(message: AssistantMessage): Part[] {
  const parts: Part[] = [];
  if (message.content.length > 0) {
    parts.push({ text: message.content });
  }
  for (const call of message.toolCalls ?? []) {
    parts.push({ functionCall: { name: call.name, args: normalizeArgs(call.arguments) } });
  }
  return parts;
}

function normalizeArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (args as Record<string, unknown> | undefined) ?? {};
}

function toFunctionDeclarations(tools: ProviderToolDefinition[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // ProviderToolDefinition.schema is `unknown` at the type level to keep the runtime
    // provider-agnostic, but every tool built via createTool() sets it to a zod schema.
    parametersJsonSchema: zodToJsonSchema(tool.schema as z.ZodTypeAny),
  }));
}

function fromResponse(response: GenerateContentResponse): ModelResponse {
  const toolCalls: ToolCall[] = (response.functionCalls ?? []).map((call) => ({
    id: call.id ?? createId("call"),
    name: call.name ?? "",
    arguments: call.args ?? {},
  }));
  const finishReason = response.candidates?.[0]?.finishReason;

  return {
    id: response.responseId ?? createId("gemini"),
    content: response.text ?? "",
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(response.usageMetadata ? { usage: fromUsage(response.usageMetadata) } : {}),
    raw: response,
  };
}

function fromUsage(usage: GenerateContentResponseUsageMetadata): ModelUsage {
  return {
    ...(usage.promptTokenCount !== undefined ? { inputTokens: usage.promptTokenCount } : {}),
    ...(usage.candidatesTokenCount !== undefined
      ? { outputTokens: usage.candidatesTokenCount }
      : {}),
    ...(usage.totalTokenCount !== undefined ? { totalTokens: usage.totalTokenCount } : {}),
  };
}

/**
 * Gemini streams whole GenerateContentResponse objects where .text/.functionCalls
 * carry only that chunk's incremental content (not the cumulative response so
 * far), and function call arguments arrive complete in one chunk rather than
 * as fragments — so, unlike OpenAI/Anthropic, no cross-chunk id/name tracking
 * or argument concatenation is needed here.
 */
async function* mapGeminiStream(
  stream: AsyncIterable<GenerateContentResponse>,
): AsyncGenerator<ModelStreamChunk> {
  let lastId = "";
  let finalUsage: ModelUsage | undefined;

  for await (const chunk of stream) {
    lastId = chunk.responseId ?? lastId;
    if (chunk.usageMetadata) {
      finalUsage = fromUsage(chunk.usageMetadata);
    }

    const id = lastId || createId("gemini");
    if (chunk.text) {
      yield { id, delta: chunk.text, done: false };
    }

    for (const call of chunk.functionCalls ?? []) {
      yield {
        id,
        delta: "",
        done: false,
        toolCallDelta: {
          id: call.id ?? createId("call"),
          name: call.name ?? "",
          arguments: call.args ?? {},
        },
      };
    }
  }

  yield {
    id: lastId || createId("gemini"),
    delta: "",
    done: true,
    ...(finalUsage ? { usage: finalUsage } : {}),
  };
}
