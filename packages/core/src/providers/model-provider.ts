import type { ModelRequest, ModelResponse, ModelStreamChunk } from "../types/model";

export interface ModelProvider {
  readonly id: string;
  readonly model: string;

  generate(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
  supportsTools(): boolean;
  supportsStructuredOutput(): boolean;
  supportsImages(): boolean;
  supportsAudio(): boolean;
}
