import type { ModelProvider } from "./model-provider";
import type { ModelRequest, ModelResponse, ModelStreamChunk } from "../types/model";

export type ScriptedProviderStep =
  | ModelResponse
  | ((request: ModelRequest, index: number) => Promise<ModelResponse> | ModelResponse);

export class ScriptedProvider implements ModelProvider {
  readonly id = "scripted";
  readonly model: string;
  private readonly steps: ScriptedProviderStep[];
  private index = 0;

  constructor(steps: ScriptedProviderStep[], model = "scripted-model") {
    this.steps = steps;
    this.model = model;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const step = this.steps[this.index];
    if (!step) {
      return {
        id: `scripted_${this.index}`,
        content: "",
        finishReason: "stop",
      };
    }

    const currentIndex = this.index;
    this.index += 1;
    return typeof step === "function" ? step(request, currentIndex) : step;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const response = await this.generate(request);

    for (const toolCall of response.toolCalls ?? []) {
      yield {
        id: response.id,
        delta: "",
        toolCallDelta: toolCall,
        done: false,
      };
    }

    yield {
      id: response.id,
      delta: response.content,
      done: true,
      ...(response.usage ? { usage: response.usage } : {}),
      ...(response.raw !== undefined ? { raw: response.raw } : {}),
    };
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
