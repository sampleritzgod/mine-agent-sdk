import { z } from "zod";
import {
  Agent,
  ScriptedProvider,
  createTool,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
} from "mine-agent-sdk";

/**
 * A minimal provider that actually chunks its output, to show how a real
 * provider's stream() would be consumed. ScriptedProvider only ever yields
 * a single chunk, so it isn't a useful stand-in here.
 */
class ChunkedProvider implements ModelProvider {
  readonly id = "chunked";
  readonly model = "chunked-model";
  private readonly words: string[];

  constructor(words: string[]) {
    this.words = words;
  }

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

async function demonstrateRawProviderStream(): Promise<void> {
  const provider = new ChunkedProvider([
    "The",
    "answer",
    "is",
    "streamed",
    "one",
    "chunk",
    "at",
    "a",
    "time.",
  ]);

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

/**
 * agent.stream() runs the exact same tool-detection/execute/store-result
 * loop as agent.run(), just driven through provider.stream(). It yields
 * text chunks as they arrive and finishes with a "completed" event that
 * carries the same RunResult agent.run() would have returned.
 */
async function demonstrateAgentStream(): Promise<void> {
  const getWeather = createTool({
    name: "get_weather",
    description: "Looks up the current temperature in Celsius for a city.",
    schema: z.object({ city: z.string() }),
    timeout: 1_000,
    retry: { attempts: 1 },
    metadata: {},
    execute(_input) {
      return { celsius: 24 };
    },
  });

  const provider = new ScriptedProvider([
    {
      id: "model_1",
      content: "",
      toolCalls: [{ id: "call_1", name: "get_weather", arguments: { city: "Tokyo" } }],
    },
    { id: "model_2", content: "It's 24°C in Tokyo right now." },
  ]);

  const agent = new Agent({
    name: "weather-agent",
    instructions: "Use tools to answer weather questions.",
    provider,
    tools: [getWeather],
  });

  for await (const event of agent.stream("What's the weather in Tokyo?")) {
    if (event.type === "chunk") {
      process.stdout.write(event.delta);
    } else {
      const { trace } = event.result;
      console.log(`\n(done — ${trace.toolCalls} tool call(s), ${trace.tokens.total} tokens total)`);
    }
  }
}

async function main(): Promise<void> {
  console.log("--- provider.stream() consumed directly ---");
  await demonstrateRawProviderStream();

  console.log("\n--- agent.stream(): the same tool loop as agent.run(), streamed ---");
  await demonstrateAgentStream();
}

void main();
