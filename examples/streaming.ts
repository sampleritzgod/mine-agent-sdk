import type { ModelProvider, ModelRequest, ModelResponse, ModelStreamChunk } from "../src";

/**
 * A minimal provider that actually chunks its output, to show how a real
 * provider's stream() would be consumed. ScriptedProvider only ever yields
 * a single chunk, so it isn't a useful stand-in here.
 */
class ChunkedProvider implements ModelProvider {
  readonly id = "chunked";
  readonly model = "chunked-model";

  constructor(private readonly words: string[]) {}

  async generate(_request: ModelRequest): Promise<ModelResponse> {
    return { id: "chunked_1", content: this.words.join(" ") };
  }

  async *stream(_request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    for (let index = 0; index < this.words.length; index += 1) {
      const isLast = index === this.words.length - 1;
      yield {
        id: "chunked_1",
        delta: index === 0 ? this.words[index]! : ` ${this.words[index]}`,
        done: isLast,
        ...(isLast ? { usage: { totalTokens: this.words.length } } : {}),
      };
    }
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

async function main(): Promise<void> {
  const provider = new ChunkedProvider(["The", "answer", "is", "streamed", "one", "chunk", "at", "a", "time."]);

  let accumulated = "";
  for await (const chunk of provider.stream({ messages: [], tools: [], metadata: {} })) {
    accumulated += chunk.delta;
    process.stdout.write(chunk.delta);
    if (chunk.done) {
      console.log(`\n(done — ${chunk.usage?.totalTokens} tokens total)`);
    }
  }

  console.log("Full text:", accumulated);
}

void main();
